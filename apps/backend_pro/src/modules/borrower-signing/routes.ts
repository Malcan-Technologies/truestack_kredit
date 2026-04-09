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
import { buildLoanAgreementPdfBuffer } from '../loans/loanAgreementPdfService.js';
import { AuditService } from '../compliance/auditService.js';
import { TrueSendService } from '../notifications/trueSendService.js';
import { getMalaysiaDateString } from '../../lib/malaysiaTime.js';

const router = Router();
router.use(requireBorrowerSession);

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
      select: { icNumber: true, name: true },
    });
    if (!borrower?.icNumber) {
      throw new BadRequestError('Borrower IC number is required for certificate check');
    }

    const result = await getCertInfo(borrower.icNumber);
    const hasCert = result.success && result.certStatus === 'Valid';

    res.json({
      success: true,
      hasCert,
      certStatus: result.certStatus ?? null,
      certValidFrom: result.certValidFrom ?? null,
      certValidTo: result.certValidTo ?? null,
      certSerialNo: result.certSerialNo ?? null,
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
      select: { icNumber: true, email: true },
    });
    if (!borrower?.icNumber) {
      throw new BadRequestError('Borrower IC number is required');
    }
    if (!borrower.email) {
      throw new BadRequestError('Borrower email is required for OTP delivery');
    }

    const result = await requestEmailOTP(borrower.icNumber, 'NU', borrower.email);
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
        icNumber: true,
        name: true,
        email: true,
        phone: true,
        documentType: true,
      },
    });
    if (!borrower?.icNumber || !borrower.name || !borrower.email) {
      throw new BadRequestError('Borrower IC, name, and email are required for certificate enrollment');
    }

    const docs = await prisma.borrowerDocument.findMany({
      where: {
        borrowerId,
        tenantId: tenant.id,
        category: { in: ['IC_FRONT', 'IC_BACK', 'SELFIE_LIVENESS'] },
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

    const isPassport = borrower.documentType === 'PASSPORT';

    const result = await enrollCertificate({
      UserID: borrower.icNumber,
      FullName: borrower.name,
      EmailAddress: borrower.email,
      MobileNo: borrower.phone || '',
      Nationality: 'MY',
      UserType: '1',
      IDType: isPassport ? 'P' : 'N',
      AuthFactor: body.otp,
      ...(!isPassport && docMap['IC_FRONT'] ? { NRICFront: docMap['IC_FRONT'] } : {}),
      ...(!isPassport && docMap['IC_BACK'] ? { NRICBack: docMap['IC_BACK'] } : {}),
      ...(isPassport && docMap['IC_FRONT'] ? { PassportImage: docMap['IC_FRONT'] } : {}),
      ...(docMap['SELFIE_LIVENESS'] ? { SelfieImage: docMap['SELFIE_LIVENESS'] } : {}),
    });

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
      select: { icNumber: true, email: true },
    });
    if (!borrower?.icNumber) {
      res.json({ success: true, requiresOtp: false });
      return;
    }

    const certResult = await getCertInfo(borrower.icNumber);
    const hasCert = certResult.success && certResult.certStatus === 'Valid';
    if (!hasCert) {
      res.json({ success: true, requiresOtp: false });
      return;
    }

    const otpResult = await requestEmailOTP(borrower.icNumber, 'NU', body.newEmail);
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
      select: { icNumber: true, email: true },
    });
    if (!borrower?.icNumber) {
      throw new BadRequestError('Borrower IC number is required');
    }

    const mtResult = await updateMtsaEmail(borrower.icNumber, body.newEmail, body.otp);
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
      select: { icNumber: true, email: true },
    });
    if (!borrower?.icNumber) {
      throw new BadRequestError('Borrower IC number is required');
    }

    const result = await requestEmailOTP(borrower.icNumber, 'DS');
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
      select: { icNumber: true, name: true, email: true },
    });
    if (!borrower?.icNumber || !borrower.name) {
      throw new BadRequestError('Borrower IC and name are required for signing');
    }

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
      UserID: borrower.icNumber,
      FullName: borrower.name,
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
        signerIcNumber: borrower.icNumber,
        signerName: borrower.name,
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
