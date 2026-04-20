import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { config } from '../../lib/config.js';
import { BadRequestError, NotFoundError } from '../../lib/errors.js';
import { requireBorrowerSession } from '../../middleware/authenticateBorrower.js';
import { requireActiveBorrower } from '../borrower-auth/borrowerContext.js';
import { getFile, saveAgreementFile, saveFile } from '../../lib/storage.js';
import {
  checkHealth,
  getCertInfo,
  requestEmailOTP,
  enrollCertificate,
  signAndStorePdf,
  updateMtsaEmail,
} from '../../lib/signingGatewayClient.js';
import {
  certInfoToActivationSignals,
  isMtsaSigningActiveForProject,
} from '../../lib/mtsaCertActivation.js';
import { buildLoanAgreementPdfBuffer } from '../loans/loanAgreementPdfService.js';
import { AuditService } from '../compliance/auditService.js';
import { TrueSendService } from '../notifications/trueSendService.js';
import { getMalaysiaDateString } from '../../lib/malaysiaTime.js';
import {
  mtsaNationalityFromBorrowerCountry,
  mtsaRequestUsesPassportIdType,
  storedDocumentTypeIsPassport,
} from '../../lib/mtsaIdentity.js';
import { notifySigningCertificateReadyIfNew } from '../notifications/loanLifecycleNotify.js';

const router = Router();
router.use(requireBorrowerSession);

/**
 * MTSA `UserID` must be the natural person's NRIC/passport. For corporate borrowers,
 * `Borrower.icNumber` stores the company SSM/registration id — use `authorizedRepIc` instead.
 */
function mtsaUserIdForBorrower(borrower: {
  borrowerType: string;
  icNumber: string;
  authorizedRepIc: string | null;
}): string {
  if (borrower.borrowerType === 'CORPORATE') {
    return borrower.authorizedRepIc?.trim() ?? '';
  }
  return borrower.icNumber.trim();
}

function requireMtsaUserId(
  borrower: { borrowerType: string; icNumber: string; authorizedRepIc: string | null },
  notFoundMessageIndividual: string,
): string {
  const userId = mtsaUserIdForBorrower(borrower);
  if (userId) return userId;
  if (borrower.borrowerType === 'CORPORATE') {
    throw new BadRequestError(
      'Authorized representative IC number is required for digital signing. The certificate user ID is the representative IC, not the company SSM/registration number.'
    );
  }
  throw new BadRequestError(notFoundMessageIndividual);
}

/** Full name on the certificate / SignPDF must match the signer (rep for corporate, not necessarily legal entity name). */
function requireMtsaSignerProfile(borrower: {
  borrowerType: string;
  icNumber: string;
  name: string;
  authorizedRepIc: string | null;
  authorizedRepName: string | null;
}): { userId: string; fullName: string } {
  const userId = mtsaUserIdForBorrower(borrower);
  if (!userId) {
    if (borrower.borrowerType === 'CORPORATE') {
      throw new BadRequestError(
        'Authorized representative IC number is required for certificate enrollment and signing (not the company SSM number).'
      );
    }
    throw new BadRequestError('Borrower IC number is required');
  }
  const fullName =
    borrower.borrowerType === 'CORPORATE'
      ? borrower.authorizedRepName?.trim() || borrower.name?.trim() || ''
      : borrower.name?.trim() || '';
  if (!fullName) {
    throw new BadRequestError(
      borrower.borrowerType === 'CORPORATE'
        ? 'Authorized representative name is required for certificate enrollment and signing'
        : 'Borrower name is required'
    );
  }
  return { userId, fullName };
}

function signingFooterText(): string {
  try {
    const url = new URL(config.signing.gatewayUrl);
    return `Signed digitally at ${url.hostname}`;
  } catch {
    return `Signed digitally at ${config.signing.gatewayUrl}`;
  }
}

router.get('/health', async (_req, res, next) => {
  try {
    if (!config.signing.enabled) {
      res.json({ success: true, online: false, reason: 'Signing is not enabled for this deployment' });
      return;
    }
    const result = await checkHealth();
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

router.post('/cert-status', async (req, res, next) => {
  try {
    if (!config.signing.enabled) {
      throw new BadRequestError('Signing is not enabled');
    }
    const { borrowerId, tenant } = await requireActiveBorrower(req);
    const borrower = await prisma.borrower.findFirst({
      where: { id: borrowerId, tenantId: tenant.id },
      select: { borrowerType: true, icNumber: true, authorizedRepIc: true },
    });
    if (!borrower) {
      throw new BadRequestError('Borrower not found');
    }

    const userId = requireMtsaUserId(borrower, 'Borrower IC number is required for certificate check');
    const result = await getCertInfo(userId);
    const hasCert = isMtsaSigningActiveForProject(certInfoToActivationSignals(result));

    res.json({
      success: true,
      hasCert,
      certStatus: result.certStatus ?? null,
      certValidFrom: result.certValidFrom ?? null,
      certValidTo: result.certValidTo ?? null,
      certSerialNo: result.certSerialNo ?? null,
      allowedToSign: result.allowedToSign ?? null,
      authStatus: result.authStatus ?? null,
      statusCode: result.statusCode,
      statusMsg: result.statusMsg,
      errorDescription: result.errorDescription,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/request-otp', async (req, res, next) => {
  try {
    if (!config.signing.enabled) {
      throw new BadRequestError('Signing is not enabled');
    }
    const { borrowerId, tenant } = await requireActiveBorrower(req);
    const borrower = await prisma.borrower.findFirst({
      where: { id: borrowerId, tenantId: tenant.id },
      select: { borrowerType: true, icNumber: true, authorizedRepIc: true, email: true },
    });
    if (!borrower) {
      throw new BadRequestError('Borrower not found');
    }
    if (!borrower.email) {
      throw new BadRequestError('Borrower email is required for OTP delivery');
    }

    const userId = requireMtsaUserId(borrower, 'Borrower IC number is required');
    const result = await requestEmailOTP(userId, 'NU', borrower.email);
    res.json({
      success: result.success,
      statusCode: result.statusCode,
      statusMsg: result.statusMsg,
      errorDescription: result.errorDescription,
      email: borrower.email,
    });
  } catch (err) {
    next(err);
  }
});

const enrollBodySchema = z.object({
  otp: z.string().min(4).max(8),
});

/** MTSA requires `yyyy-MM-dd HH:mm:ss` — NOT ISO 8601. */
function fmtMtsaDatetime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Categories that can satisfy MTSA RequestCertificate image fields (individual + corporate KYC). */
const ENROLL_DOC_CATEGORIES = [
  'IC_FRONT',
  'IC_BACK',
  'PASSPORT',
  'SELFIE_LIVENESS',
  'DIRECTOR_IC_FRONT',
  'DIRECTOR_IC_BACK',
  'DIRECTOR_PASSPORT',
] as const;

router.post('/enroll', async (req, res, next) => {
  try {
    if (!config.signing.enabled) {
      throw new BadRequestError('Signing is not enabled');
    }
    const body = enrollBodySchema.parse(req.body);
    const { borrowerId, tenant } = await requireActiveBorrower(req);

    const borrower = await prisma.borrower.findFirst({
      where: { id: borrowerId, tenantId: tenant.id },
      select: {
        borrowerType: true,
        icNumber: true,
        name: true,
        email: true,
        phone: true,
        documentType: true,
        country: true,
        authorizedRepIc: true,
        authorizedRepName: true,
      },
    });
    if (!borrower?.email) {
      throw new BadRequestError('Borrower email is required for certificate enrollment');
    }
    if (!borrower.phone?.trim()) {
      throw new BadRequestError(
        'Mobile number is required for certificate enrollment. MTSA requires a non-empty MobileNo (e.g. +60123456789).'
      );
    }
    const { userId, fullName } = requireMtsaSignerProfile(borrower);

    const docs = await prisma.borrowerDocument.findMany({
      where: {
        borrowerId,
        tenantId: tenant.id,
        category: { in: [...ENROLL_DOC_CATEGORIES] },
      },
      orderBy: { uploadedAt: 'desc' },
    });

    const docMap: Record<string, string> = {};
    for (const doc of docs) {
      if (docMap[doc.category]) continue;
      try {
        const buf = await getFile(doc.path);
        if (buf) {
          docMap[doc.category] = buf.toString('base64');
        }
      } catch (e) {
        console.warn(`[BorrowerSigning] Failed to read ${doc.category} from ${doc.path}:`, e);
      }
    }

    const mtsaNationality = mtsaNationalityFromBorrowerCountry(borrower.country);
    const isPassport = mtsaRequestUsesPassportIdType(
      mtsaNationality,
      storedDocumentTypeIsPassport(borrower.documentType),
    );

    // Corporate KYC stores director ID images under DIRECTOR_*; individual uses IC_* / PASSPORT.
    const nricFront = docMap['IC_FRONT'] || docMap['DIRECTOR_IC_FRONT'];
    const nricBack = docMap['IC_BACK'] || docMap['DIRECTOR_IC_BACK'];
    const passportImage =
      docMap['PASSPORT'] || docMap['DIRECTOR_PASSPORT'] || docMap['IC_FRONT'] || docMap['DIRECTOR_IC_FRONT'];
    const selfie = docMap['SELFIE_LIVENESS'];

    if (!isPassport) {
      if (!nricFront || !nricBack) {
        throw new BadRequestError(
          'MyKad front and back images are required for certificate enrollment. Ensure KYC completed and ID images are on file.'
        );
      }
    } else if (!passportImage) {
      throw new BadRequestError(
        'Passport image is required for certificate enrollment. Ensure KYC completed and passport image is on file.'
      );
    }
    if (!selfie) {
      throw new BadRequestError(
        'Selfie (liveness) image is required for certificate enrollment. Ensure KYC completed and selfie is on file.'
      );
    }

    // MTSA rejects RequestCertificate when VerificationData is absent ("verify data is null"),
    // even though the ICD lists it as optional for UserType 1. Populate it from the borrower's
    // latest approved TrueStack KYC session, or fall back to a generic e-KYC record.
    const latestKyc = await prisma.truestackKycSession.findFirst({
      where: {
        borrowerId,
        tenantId: tenant.id,
        status: 'completed',
        result: 'approved',
      },
      orderBy: { updatedAt: 'desc' },
    });

    const result = await enrollCertificate({
      UserID: userId,
      FullName: fullName,
      EmailAddress: borrower.email,
      MobileNo: borrower.phone!.trim(),
      Nationality: mtsaNationality,
      UserType: '1',
      IDType: isPassport ? 'P' : 'N',
      AuthFactor: body.otp,
      ...(!isPassport ? { NRICFront: nricFront, NRICBack: nricBack } : {}),
      ...(isPassport ? { PassportImage: passportImage } : {}),
      SelfieImage: selfie,
      VerificationData: {
        verifyDatetime: fmtMtsaDatetime(latestKyc?.updatedAt ?? new Date()),
        verifyMethod: 'e-KYC (face recognition with liveness detection)',
        verifyStatus: 'approved',
        verifyVerifier: 'TrueStack',
      },
    });

    if (result.success) {
      await notifySigningCertificateReadyIfNew({ tenantId: tenant.id, borrowerId });
    }

    res.json({
      success: result.success,
      statusCode: result.statusCode,
      statusMsg: result.statusMsg,
      errorDescription: result.errorDescription,
      certSerialNo: result.certSerialNo ?? null,
      certValidFrom: result.certValidFrom ?? null,
      certValidTo: result.certValidTo ?? null,
    });
  } catch (err) {
    next(err);
  }
});

// ---- MTSA Email Change (check cert → OTP → update) ----

const checkEmailChangeSchema = z.object({
  newEmail: z.string().email().min(1),
});

router.post('/check-email-change', async (req, res, next) => {
  try {
    if (!config.signing.enabled) {
      res.json({ success: true, requiresOtp: false });
      return;
    }
    const body = checkEmailChangeSchema.parse(req.body);
    const { borrowerId, tenant } = await requireActiveBorrower(req);
    const borrower = await prisma.borrower.findFirst({
      where: { id: borrowerId, tenantId: tenant.id },
      select: { borrowerType: true, icNumber: true, authorizedRepIc: true, email: true },
    });
    if (!borrower) {
      res.json({ success: true, requiresOtp: false });
      return;
    }

    let userId: string;
    try {
      userId = requireMtsaUserId(borrower, 'Borrower IC number is required');
    } catch {
      res.json({ success: true, requiresOtp: false });
      return;
    }

    const certResult = await getCertInfo(userId);
    const hasCert = isMtsaSigningActiveForProject(certInfoToActivationSignals(certResult));
    if (!hasCert) {
      res.json({ success: true, requiresOtp: false });
      return;
    }

    const otpResult = await requestEmailOTP(userId, 'NU', body.newEmail);
    if (!otpResult.success) {
      res.json({
        success: false,
        requiresOtp: true,
        error: otpResult.errorDescription || otpResult.statusMsg || 'Failed to send OTP',
      });
      return;
    }

    res.json({ success: true, requiresOtp: true, otpSent: true });
  } catch (err) {
    next(err);
  }
});

const confirmEmailChangeSchema = z.object({
  newEmail: z.string().email().min(1),
  otp: z.string().min(4).max(8),
});

router.post('/confirm-email-change', async (req, res, next) => {
  try {
    if (!config.signing.enabled) {
      throw new BadRequestError('Signing is not enabled');
    }
    const body = confirmEmailChangeSchema.parse(req.body);
    const { borrowerId, tenant } = await requireActiveBorrower(req);
    const borrower = await prisma.borrower.findFirst({
      where: { id: borrowerId, tenantId: tenant.id },
      select: { borrowerType: true, icNumber: true, authorizedRepIc: true, email: true },
    });
    if (!borrower) {
      throw new BadRequestError('Borrower not found');
    }

    const userId = requireMtsaUserId(borrower, 'Borrower IC number is required');
    const mtResult = await updateMtsaEmail(userId, body.newEmail, body.otp);
    if (!mtResult.success) {
      res.json({
        success: false,
        statusCode: mtResult.statusCode,
        statusMsg: mtResult.statusMsg,
        errorDescription: mtResult.errorDescription || 'Failed to update email in certificate system',
      });
      return;
    }

    await prisma.borrower.update({
      where: { id: borrowerId },
      data: { email: body.newEmail },
    });

    await AuditService.log({
      tenantId: tenant.id,
      action: 'BORROWER_MTSA_EMAIL_UPDATED',
      entityType: 'Borrower',
      entityId: borrowerId,
      previousData: { email: borrower.email },
      newData: { email: body.newEmail },
      ipAddress: req.ip,
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ---- Signing OTP (usage 'DS' for digital signing) ----

router.post('/request-signing-otp', async (req, res, next) => {
  try {
    if (!config.signing.enabled) {
      throw new BadRequestError('Signing is not enabled');
    }
    const { borrowerId, tenant } = await requireActiveBorrower(req);
    const borrower = await prisma.borrower.findFirst({
      where: { id: borrowerId, tenantId: tenant.id },
      select: { borrowerType: true, icNumber: true, authorizedRepIc: true, email: true },
    });
    if (!borrower) {
      throw new BadRequestError('Borrower not found');
    }

    const userId = requireMtsaUserId(borrower, 'Borrower IC number is required');
    const result = await requestEmailOTP(userId, 'DS');
    res.json({
      success: result.success,
      statusCode: result.statusCode,
      statusMsg: result.statusMsg,
      errorDescription: result.errorDescription,
      email: borrower.email ?? null,
    });
  } catch (err) {
    next(err);
  }
});

// ---- Agreement Preview (generate PDF for review, no signing) ----

router.post('/agreement-preview', async (req, res, next) => {
  try {
    if (!config.signing.enabled) {
      throw new BadRequestError('Signing is not enabled');
    }
    const { loanId } = z.object({ loanId: z.string().min(1) }).parse(req.body);
    const { borrowerId, tenant } = await requireActiveBorrower(req);

    const loan = await prisma.loan.findFirst({
      where: { id: loanId, tenantId: tenant.id, borrowerId },
    });
    if (!loan) {
      throw new NotFoundError('Loan');
    }

    const agreementDate = getMalaysiaDateString();
    const { buffer } = await buildLoanAgreementPdfBuffer({
      tenantId: tenant.id,
      loanId,
      agreementDateParam: agreementDate,
      footerText: signingFooterText(),
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="agreement-preview.pdf"');
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

// ---- Sign Agreement ----

const signAgreementSchema = z.object({
  loanId: z.string().min(1),
  authFactor: z.string().min(4).max(8).optional(),
  otp: z.string().min(4).max(8).optional(),
  authMethod: z.enum(['emailOtp', 'pin']).default('emailOtp'),
  signatureImage: z.string().min(1, 'Signature image is required'),
}).superRefine((data, ctx) => {
  if (!data.authFactor && !data.otp) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['authFactor'],
      message: 'Auth factor is required',
    });
  }
});

router.post('/sign-agreement', async (req, res, next) => {
  try {
    if (!config.signing.enabled) {
      throw new BadRequestError('Signing is not enabled');
    }
    const body = signAgreementSchema.parse(req.body);
    const authFactor = body.authFactor ?? body.otp!;
    const { borrowerId, tenant } = await requireActiveBorrower(req);

    const loan = await prisma.loan.findFirst({
      where: { id: body.loanId, tenantId: tenant.id, borrowerId },
    });
    if (!loan) {
      throw new NotFoundError('Loan');
    }
    if (loan.status !== 'PENDING_DISBURSEMENT' && loan.status !== 'PENDING_ATTESTATION') {
      throw new BadRequestError('Loan is not in a signable state');
    }

    const borrower = await prisma.borrower.findFirst({
      where: { id: borrowerId, tenantId: tenant.id },
      select: {
        borrowerType: true,
        icNumber: true,
        name: true,
        email: true,
        authorizedRepIc: true,
        authorizedRepName: true,
      },
    });
    if (!borrower) {
      throw new BadRequestError('Borrower not found');
    }
    const { userId, fullName } = requireMtsaSignerProfile(borrower);

    const agreementDate = getMalaysiaDateString();
    const { buffer, filename, signatureFields } = await buildLoanAgreementPdfBuffer({
      tenantId: tenant.id,
      loanId: body.loanId,
      agreementDateParam: agreementDate,
      footerText: signingFooterText(),
    });

    const borrowerSigFields = signatureFields.filter(f => f.role === 'borrower');
    if (!borrowerSigFields.length) {
      throw new BadRequestError('No borrower signature fields found in the generated agreement');
    }
    const sigField = borrowerSigFields[0];

    const pdfBase64 = buffer.toString('base64');

    let sigImage = body.signatureImage;
    if (sigImage.includes(',')) {
      sigImage = sigImage.split(',')[1];
    }

    // MTSA SignPDF does not take a UserType field. Per the ICD, the effective
    // mode is determined by the signer identity plus whether AuthFactor is an
    // email OTP (external) or certificate PIN (internal).
    const signResult = await signAndStorePdf({
      UserID: userId,
      FullName: fullName,
      AuthFactor: authFactor,
      loanId: body.loanId,
      SignatureInfo: {
        pdfInBase64: pdfBase64,
        visibility: true,
        pageNo: sigField.pageNo,
        x1: sigField.x1,
        y1: sigField.y1,
        x2: sigField.x2,
        y2: sigField.y2,
        sigImageInBase64: sigImage,
      },
    });

    if (!signResult.success || !signResult.signedPdfInBase64) {
      res.json({
        success: false,
        statusCode: signResult.statusCode,
        statusMsg: signResult.statusMsg,
        errorDescription: signResult.errorDescription || 'Signing failed',
      });
      return;
    }

    const signedPdfBuffer = Buffer.from(signResult.signedPdfInBase64, 'base64');
    const signedFilename = `digitally-signed-${filename}`;

    // Save signed PDF
    const { path: agreementPath, filename: storedFilename } = await saveAgreementFile(
      signedPdfBuffer,
      body.loanId,
      signedFilename
    );

    // Save borrower signature image
    const sigImageBuffer = Buffer.from(sigImage, 'base64');
    const { path: signaturePath } = await saveFile(
      sigImageBuffer,
      'borrower-signatures',
      body.loanId,
      `borrower-signature-${body.loanId.substring(0, 8)}.png`,
    );

    const newVersion = loan.agreementVersion + 1;
    await prisma.loan.update({
      where: { id: body.loanId },
      data: {
        agreementPath,
        agreementFilename: storedFilename,
        agreementOriginalName: signedFilename,
        agreementMimeType: 'application/pdf',
        agreementSize: signedPdfBuffer.length,
        agreementUploadedAt: new Date(),
        agreementVersion: newVersion,
        borrowerSignedAgreementPath: agreementPath,
        signedAgreementReviewStatus: 'PENDING',
        agreementSignatureFields: signatureFields as any,
      },
    });

    // Audit: digital signing event with signature record
    await AuditService.log({
      tenantId: tenant.id,
      action: 'BORROWER_DIGITAL_SIGN_AGREEMENT',
      entityType: 'Loan',
      entityId: body.loanId,
      previousData: loan.agreementPath
        ? { version: loan.agreementVersion, path: loan.agreementPath }
        : null,
      newData: {
        version: newVersion,
        path: agreementPath,
        filename: signedFilename,
        agreementDate,
        authMethod: body.authMethod,
        signedAgreementReviewStatus: 'PENDING',
        signerIcNumber: userId,
        signerName: fullName,
        borrowerSignaturePath: signaturePath,
        onPremDocument: signResult.document,
      },
      ipAddress: req.ip,
    });

    // Fire-and-forget: email the signed PDF to the borrower + audit
    void TrueSendService.sendSignedAgreement(
      tenant.id,
      body.loanId,
      agreementPath,
      signedFilename,
    ).then((sent) => {
      void AuditService.log({
        tenantId: tenant.id,
        action: 'SIGNED_AGREEMENT_EMAILED',
        entityType: 'Loan',
        entityId: body.loanId,
        newData: {
          recipientEmail: borrower.email,
          recipientName: borrower.name,
          attachmentPath: agreementPath,
          attachmentFilename: signedFilename,
          emailSent: sent,
        },
      });
    }).catch((err) => {
      console.error('[BorrowerSigning] Failed to email signed agreement:', err);
      void AuditService.log({
        tenantId: tenant.id,
        action: 'SIGNED_AGREEMENT_EMAIL_FAILED',
        entityType: 'Loan',
        entityId: body.loanId,
        newData: {
          recipientEmail: borrower.email,
          error: err instanceof Error ? err.message : String(err),
        },
      });
    });

    res.json({
      success: true,
      agreementDate,
      filename: signedFilename,
      sizeBytes: signedPdfBuffer.length,
      signedAgreementReviewStatus: 'PENDING',
      onPremDocument: signResult.document ?? null,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
