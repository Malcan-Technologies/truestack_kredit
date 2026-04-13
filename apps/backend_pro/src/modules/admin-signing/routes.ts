import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { config } from '../../lib/config.js';
import { BadRequestError, NotFoundError } from '../../lib/errors.js';
import { authenticateToken } from '../../middleware/authenticate.js';
import { requireAnyPermission, requirePermission } from '../../middleware/requireRole.js';
import {
  checkHealth,
  getCertInfo,
  requestEmailOTP,
  enrollCertificate,
  signAndStorePdf,
  verifyCertPin,
  revokeCertificate,
  resetCertPin,
  verifyPdfSignature,
  updateMtsaEmail,
} from '../../lib/signingGatewayClient.js';
import { createKycSession } from '../truestack-kyc/publicApiClient.js';
import { AuditService } from '../compliance/auditService.js';
import { getFile, saveAgreementFile, saveFile } from '../../lib/storage.js';
import type { SignatureFieldMeta } from '../../lib/pdfService.js';
import { subscribeTenantTruestackKyc } from '../../lib/truestackKycSseHub.js';

const router = Router();
router.use(authenticateToken);

/** SSE: TrueStack KYC webhook updates for this tenant (staff + borrower sessions). */
router.get('/kyc/stream', requireAnyPermission('trueidentity.view', 'trueidentity.manage'), async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const keepAlive = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        clearInterval(keepAlive);
      }
    }, 25_000);

    const unsub = subscribeTenantTruestackKyc(tenantId, (payload) => {
      try {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      } catch {
        /* client gone */
      }
    });

    req.on('close', () => {
      clearInterval(keepAlive);
      unsub();
    });
  } catch (err) {
    next(err);
  }
});

/** MTSA requires `yyyy-MM-dd HH:mm:ss` — NOT ISO 8601 */
function fmtMtsaDatetime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

type MtsaNationality = 'MY' | 'ZZ';

function isMalaysianCountryOrNationality(stored: string | null | undefined): boolean {
  const value = stored?.trim().toUpperCase() ?? '';
  return !value || value === 'MY' || value === 'MYS' || value === 'MALAYSIA';
}

function mtsaNationalityFromStaffProfile(storedNationality: string | null | undefined): MtsaNationality {
  return isMalaysianCountryOrNationality(storedNationality) ? 'MY' : 'ZZ';
}

function storedDocumentTypeIsPassport(documentType: string | null | undefined): boolean {
  return documentType?.trim().toUpperCase() === 'PASSPORT';
}

function mtsaRequestUsesPassportIdType(
  mtsaNationality: MtsaNationality,
  documentTypePassport: boolean,
): boolean {
  if (mtsaNationality === 'MY') return false;
  return documentTypePassport;
}

const requireSigningCertificatesView = requireAnyPermission(
  'signing_certificates.view',
  'signing_certificates.manage',
  'attestation.witness_sign'
);
const requireSigningCertificatesManage = requireAnyPermission(
  'signing_certificates.manage',
  'attestation.witness_sign'
);
const requireAgreementSigning = requireAnyPermission(
  'agreements.manage',
  'attestation.witness_sign'
);

// ============================================
// Profile endpoints
// ============================================

const profileSchema = z.object({
  icNumber: z.string().min(1),
  fullName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  nationality: z.string().default('MY'),
  documentType: z.string().default('MYKAD'),
  designation: z.string().optional(),
});

router.get('/profile', requireSigningCertificatesView, async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.user!.userId;

    const profile = await prisma.staffSigningProfile.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      include: { documents: true, kycSessions: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });

    res.json({ success: true, profile });
  } catch (err) {
    next(err);
  }
});

router.post('/profile', requireSigningCertificatesManage, async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.user!.userId;
    const body = profileSchema.parse(req.body);

    const profile = await prisma.staffSigningProfile.upsert({
      where: { tenantId_userId: { tenantId, userId } },
      create: { tenantId, userId, ...body },
      update: body,
    });

    res.json({ success: true, profile });
  } catch (err) {
    next(err);
  }
});

// ============================================
// KYC endpoints
// ============================================

router.post('/kyc/start', requireSigningCertificatesManage, async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.user!.userId;

    const profile = await prisma.staffSigningProfile.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });
    if (!profile) {
      throw new BadRequestError('Please set up your signing profile first');
    }

    const base = config.truestackKyc.publicWebhookBaseUrl;
    const key = config.truestackKyc.apiKey;
    if (!key || !base) {
      res.status(503).json({
        success: false,
        error: 'TrueStack KYC is not configured. Set TRUESTACK_KYC_API_KEY and TRUESTACK_KYC_PUBLIC_WEBHOOK_BASE_URL.',
      });
      return;
    }

    const webhookUrl = new URL('/api/webhooks/truestack-kyc', base).href;
    const documentType = profile.documentType === 'PASSPORT' ? '2' : '1';

    const createBody = {
      document_name: profile.fullName,
      document_number: profile.icNumber,
      webhook_url: webhookUrl,
      document_type: documentType,
      platform: 'Web' as const,
      metadata: {
        type: 'staff',
        profileId: profile.id,
        tenantId,
        userId,
      },
    };
    const ts = await createKycSession({
      ...createBody,
      ...(config.truestackKyc.redirectUrl ? { redirect_url: config.truestackKyc.redirectUrl } : {}),
    });

    const expiresAt = ts.expires_at ? new Date(ts.expires_at) : null;

    await prisma.$transaction(async (tx) => {
      await tx.staffKycSession.updateMany({
        where: {
          tenantId,
          profileId: profile.id,
          NOT: { AND: [{ status: 'completed' }, { result: 'approved' }] },
        },
        data: { status: 'expired', result: null },
      });

      await tx.staffKycSession.create({
        data: {
          tenantId,
          profileId: profile.id,
          externalSessionId: ts.id,
          onboardingUrl: ts.onboarding_url,
          expiresAt,
          status: ts.status || 'pending',
        },
      });
    });

    res.json({
      success: true,
      sessionId: ts.id,
      onboardingUrl: ts.onboarding_url,
      expiresAt,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/kyc/status', requireSigningCertificatesView, async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.user!.userId;

    const profile = await prisma.staffSigningProfile.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      include: {
        documents: true,
        kycSessions: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    if (!profile) {
      res.json({ success: true, kycComplete: false, hasProfile: false });
      return;
    }

    const latestSession = profile.kycSessions[0];
    const hasDocuments = profile.documents.length > 0;

    res.json({
      success: true,
      kycComplete: profile.kycComplete,
      hasProfile: true,
      hasDocuments,
      latestSession: latestSession
        ? {
            status: latestSession.status,
            result: latestSession.result,
            rejectMessage: latestSession.rejectMessage,
            onboardingUrl: latestSession.onboardingUrl,
            expiresAt: latestSession.expiresAt,
          }
        : null,
    });
  } catch (err) {
    next(err);
  }
});

// ============================================
// Certificate endpoints
// ============================================

router.get('/health', requireSigningCertificatesView, async (_req, res, next) => {
  try {
    const health = await checkHealth();
    res.json({ success: true, ...health });
  } catch (err) {
    next(err);
  }
});

router.post('/cert-status', requireSigningCertificatesManage, async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.user!.userId;

    const profile = await prisma.staffSigningProfile.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });
    if (!profile) {
      throw new BadRequestError('Signing profile not found');
    }

    const certInfo = await getCertInfo(profile.icNumber);

    if (certInfo.success && certInfo.certStatus) {
      await prisma.staffSigningProfile.update({
        where: { id: profile.id },
        data: {
          certStatus: certInfo.certStatus,
          certSerialNo: certInfo.certSerialNo || profile.certSerialNo,
          certValidFrom: certInfo.certValidFrom ? new Date(certInfo.certValidFrom) : profile.certValidFrom,
          certValidTo: certInfo.certValidTo ? new Date(certInfo.certValidTo) : profile.certValidTo,
        },
      });
    }

    res.json({ success: true, certInfo });
  } catch (err) {
    next(err);
  }
});

router.post('/cert-check', requirePermission('signing_certificates.view'), async (req, res, next) => {
  try {
    const { icNumber } = z.object({ icNumber: z.string().min(1) }).parse(req.body);
    const certInfo = await getCertInfo(icNumber);
    res.json({ success: true, certInfo });
  } catch (err) {
    next(err);
  }
});

// ============================================
// Email change (MTSA sync) endpoints
// ============================================

router.post('/check-email-change', requireSigningCertificatesManage, async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.user!.userId;
    const { newEmail } = z.object({ newEmail: z.string().email() }).parse(req.body);

    if (!config.signing.enabled) {
      res.json({ requiresOtp: false });
      return;
    }

    const profile = await prisma.staffSigningProfile.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });
    if (!profile) {
      res.json({ requiresOtp: false });
      return;
    }

    const certInfo = await getCertInfo(profile.icNumber);
    if (!certInfo.success || certInfo.certStatus !== 'Valid') {
      res.json({ requiresOtp: false });
      return;
    }

    const otpResult = await requestEmailOTP(profile.icNumber, 'NU', newEmail);
    if (!otpResult.success) {
      res.status(400).json({
        requiresOtp: true,
        otpSent: false,
        error: otpResult.errorDescription || otpResult.statusMsg || 'Failed to send OTP',
      });
      return;
    }

    res.json({ requiresOtp: true, otpSent: true });
  } catch (err) {
    next(err);
  }
});

router.post('/confirm-email-change', requireSigningCertificatesManage, async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.user!.userId;
    const { newEmail, otp } = z.object({
      newEmail: z.string().email(),
      otp: z.string().min(1),
    }).parse(req.body);

    const profile = await prisma.staffSigningProfile.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });
    if (!profile) {
      throw new BadRequestError('Signing profile not found');
    }

    const result = await updateMtsaEmail(profile.icNumber, newEmail, otp);
    if (!result.success) {
      res.status(400).json({
        success: false,
        error: result.errorDescription || result.statusMsg || 'Email update failed',
      });
      return;
    }

    const previousEmail = profile.email;
    await prisma.staffSigningProfile.update({
      where: { id: profile.id },
      data: { email: newEmail },
    });

    await AuditService.log({
      tenantId,
      action: 'STAFF_MTSA_EMAIL_UPDATED',
      entityType: 'StaffSigningProfile',
      entityId: profile.id,
      newData: { previousEmail, newEmail, userId },
      ipAddress: req.ip,
    });

    await prisma.adminAuditLog.create({
      data: {
        userId,
        tenantId,
        action: 'STAFF_MTSA_EMAIL_UPDATED',
        targetId: profile.id,
        targetType: 'StaffSigningProfile',
        details: JSON.stringify({
          fullName: profile.fullName,
          previousEmail,
          newEmail,
        }),
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

const orgRegistrationTypes = ['NTRMY', 'IRB', 'RMC', 'CIDB', 'BAM', 'GOV', 'GOVSUB', 'INT', 'LEI'] as const;
const orgUserRegistrationTypes = ['IDC', 'PAS'] as const;

const enrollSchema = z.object({
  pin: z.string().min(4).max(8),
  phone: z.string().min(1, 'Mobile number is required').max(15, 'Mobile number must be 15 characters or fewer'),
  organisationInfo: z.object({
    orgName: z.string().min(1, 'Organisation name is required'),
    orgUserDesignation: z.string().optional(),
    orgUserRegistrationNo: z.string().min(1, 'User registration number is required'),
    orgUserRegistrationType: z.enum(orgUserRegistrationTypes),
    orgAddress: z.string().min(1, 'Organisation address is required'),
    orgAddressCity: z.string().min(1, 'City is required'),
    orgAddressState: z.string().min(1, 'State is required'),
    orgAddressPostcode: z.string().min(1, 'Postcode is required'),
    orgAddressCountry: z.string().min(1).default('MY'),
    orgRegistationNo: z.string().min(1, 'Organisation registration number is required'),
    orgRegistationType: z.enum(orgRegistrationTypes).default('NTRMY'),
    orgPhoneNo: z.string().min(1, 'Organisation phone number is required'),
  }),
});

router.post('/request-otp', requireSigningCertificatesManage, async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.user!.userId;

    const profile = await prisma.staffSigningProfile.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });
    if (!profile) {
      throw new BadRequestError('Signing profile not found');
    }
    if (!profile.kycComplete) {
      throw new BadRequestError('KYC verification must be completed before certificate enrollment');
    }

    const result = await requestEmailOTP(profile.icNumber, 'NU', profile.email);
    res.json({ success: result.success, statusCode: result.statusCode, statusMsg: result.statusMsg });
  } catch (err) {
    next(err);
  }
});

router.post('/enroll', requireSigningCertificatesManage, async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.user!.userId;
    const body = enrollSchema.parse(req.body);

    const profile = await prisma.staffSigningProfile.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      include: { documents: true },
    });
    if (!profile) {
      throw new BadRequestError('Signing profile not found');
    }
    if (!profile.kycComplete) {
      throw new BadRequestError('KYC must be completed before enrollment');
    }

    const mtsaNationality = mtsaNationalityFromStaffProfile(profile.nationality);
    const isPassport = mtsaRequestUsesPassportIdType(
      mtsaNationality,
      storedDocumentTypeIsPassport(profile.documentType),
    );
    const docMap: Record<string, string | undefined> = {};
    for (const doc of profile.documents) {
      const buf = await getFile(doc.path);
      if (buf) docMap[doc.category] = buf.toString('base64');
    }

    if (!isPassport && (!docMap['IC_FRONT'] || !docMap['IC_BACK'])) {
      throw new BadRequestError('MyKad front and back images are required for enrollment');
    }
    if (isPassport && !docMap['IC_FRONT']) {
      throw new BadRequestError('Passport image is required for enrollment');
    }
    if (!docMap['SELFIE_LIVENESS']) {
      throw new BadRequestError('Selfie image is required for enrollment');
    }
    if (body.phone !== profile.phone) {
      await prisma.staffSigningProfile.update({
        where: { id: profile.id },
        data: { phone: body.phone },
      });
    }

    const latestKyc = await prisma.staffKycSession.findFirst({
      where: { profileId: profile.id, status: 'completed', result: 'approved' },
      orderBy: { createdAt: 'desc' },
    });

    const enrollResult = await enrollCertificate({
      UserID: profile.icNumber,
      FullName: profile.fullName,
      EmailAddress: profile.email,
      MobileNo: body.phone,
      Nationality: mtsaNationality,
      UserType: '2',
      IDType: isPassport ? 'P' : 'N',
      AuthFactor: body.pin,
      ...(!isPassport ? { NRICFront: docMap['IC_FRONT'], NRICBack: docMap['IC_BACK'] } : {}),
      ...(isPassport ? { PassportImage: docMap['IC_FRONT'] } : {}),
      SelfieImage: docMap['SELFIE_LIVENESS'],
      OrganisationInfo: {
        orgName: body.organisationInfo.orgName,
        orgUserDesignation: body.organisationInfo.orgUserDesignation || profile.designation || 'Authorised Signatory',
        orgUserRegistrationNo: body.organisationInfo.orgUserRegistrationNo,
        orgUserRegistrationType: body.organisationInfo.orgUserRegistrationType,
        orgAddress: body.organisationInfo.orgAddress,
        orgAddressCity: body.organisationInfo.orgAddressCity,
        orgAddressState: body.organisationInfo.orgAddressState,
        orgAddressPostcode: body.organisationInfo.orgAddressPostcode,
        orgAddressCountry: body.organisationInfo.orgAddressCountry,
        orgRegistationNo: body.organisationInfo.orgRegistationNo,
        orgRegistationType: body.organisationInfo.orgRegistationType || 'NTRMY',
        orgPhoneNo: body.organisationInfo.orgPhoneNo,
      },
      VerificationData: latestKyc
        ? { verifyDatetime: fmtMtsaDatetime(latestKyc.updatedAt), verifyMethod: 'e-KYC (face recognition with liveness detection)', verifyStatus: 'approved', verifyVerifier: 'TrueStack' }
        : { verifyDatetime: fmtMtsaDatetime(new Date()), verifyMethod: 'Manual face-to-face verification', verifyStatus: 'approved', verifyVerifier: 'TrueStack' },
    });

    if (enrollResult.success) {
      await prisma.staffSigningProfile.update({
        where: { id: profile.id },
        data: {
          certSerialNo: enrollResult.certSerialNo,
          certStatus: 'Valid',
          certValidFrom: enrollResult.certValidFrom ? new Date(enrollResult.certValidFrom) : undefined,
          certValidTo: enrollResult.certValidTo ? new Date(enrollResult.certValidTo) : undefined,
        },
      });

      await AuditService.log({
        tenantId,
        action: 'STAFF_CERT_ENROLLED',
        entityType: 'StaffSigningProfile',
        entityId: profile.id,
        newData: {
          userId,
          icNumber: profile.icNumber,
          certSerialNo: enrollResult.certSerialNo,
        },
        ipAddress: req.ip,
      });

      await prisma.adminAuditLog.create({
        data: {
          userId,
          tenantId,
          action: 'STAFF_CERT_ENROLLED',
          targetId: profile.id,
          targetType: 'StaffSigningProfile',
          details: JSON.stringify({
            fullName: profile.fullName,
            icNumber: profile.icNumber,
            signingEmail: profile.email,
            certSerialNo: enrollResult.certSerialNo,
          }),
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        },
      });
    }

    res.json({
      success: enrollResult.success,
      statusCode: enrollResult.statusCode,
      statusMsg: enrollResult.statusMsg,
      errorDescription: enrollResult.errorDescription,
      certSerialNo: enrollResult.certSerialNo,
      certValidFrom: enrollResult.certValidFrom,
      certValidTo: enrollResult.certValidTo,
      certRequestID: enrollResult.certRequestID,
      certRequestStatus: enrollResult.certRequestStatus,
    });
  } catch (err) {
    next(err);
  }
});

const certPinManagementSchema = z
  .string()
  .regex(/^\d{4,32}$/, 'PIN must be 4–32 digits (numbers only)');

const revokeSchema = z.object({
  certSerialNo: z.string().min(1),
  reason: z.enum(['keyCompromise', 'CACompromise', 'affiliationChanged', 'superseded', 'cessationOfOperation']),
  pin: certPinManagementSchema,
});

router.post('/revoke', requireSigningCertificatesManage, async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.user!.userId;
    const body = revokeSchema.parse(req.body);

    const profile = await prisma.staffSigningProfile.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      include: { documents: true },
    });
    if (!profile) {
      throw new BadRequestError('Signing profile not found');
    }

    const mtsaNationality = mtsaNationalityFromStaffProfile(profile.nationality);
    const isPassport = mtsaRequestUsesPassportIdType(
      mtsaNationality,
      storedDocumentTypeIsPassport(profile.documentType),
    );
    const docMap: Record<string, string | undefined> = {};
    for (const doc of profile.documents) {
      const buf = await getFile(doc.path);
      if (buf) docMap[doc.category] = buf.toString('base64');
    }

    if (!isPassport && (!docMap['IC_FRONT'] || !docMap['IC_BACK'])) {
      throw new BadRequestError('MyKad front and back images are required for revocation');
    }
    if (isPassport && !docMap['IC_FRONT']) {
      throw new BadRequestError('Passport image is required for revocation');
    }

    const latestKyc = await prisma.staffKycSession.findFirst({
      where: { profileId: profile.id, status: 'completed', result: 'approved' },
      orderBy: { createdAt: 'desc' },
    });

    const result = await revokeCertificate({
      UserID: profile.icNumber,
      CertSerialNo: body.certSerialNo,
      RevokeReason: body.reason,
      RevokeBy: 'Self',
      AuthFactor: body.pin,
      IDType: isPassport ? 'P' : 'N',
      ...(!isPassport ? { NRICFront: docMap['IC_FRONT'], NRICBack: docMap['IC_BACK'] } : {}),
      ...(isPassport ? { PassportImage: docMap['IC_FRONT'] } : {}),
      VerificationData: latestKyc
        ? { verifyDatetime: fmtMtsaDatetime(latestKyc.updatedAt), verifyMethod: 'e-KYC (face recognition with liveness detection)', verifyStatus: 'approved', verifyVerifier: 'TrueStack' }
        : { verifyDatetime: fmtMtsaDatetime(new Date()), verifyMethod: 'Manual face-to-face verification', verifyStatus: 'approved', verifyVerifier: 'TrueStack' },
    });

    if (result.success) {
      await prisma.staffSigningProfile.update({
        where: { id: profile.id },
        data: { certStatus: 'Revoked' },
      });

      await AuditService.log({
        tenantId,
        action: 'STAFF_CERT_REVOKED',
        entityType: 'StaffSigningProfile',
        entityId: profile.id,
        newData: {
          userId,
          icNumber: profile.icNumber,
          certSerialNo: body.certSerialNo,
          reason: body.reason,
        },
        ipAddress: req.ip,
      });

      await prisma.adminAuditLog.create({
        data: {
          userId,
          tenantId,
          action: 'STAFF_CERT_REVOKED',
          targetId: profile.id,
          targetType: 'StaffSigningProfile',
          details: JSON.stringify({
            fullName: profile.fullName,
            icNumber: profile.icNumber,
            certSerialNo: body.certSerialNo,
            reason: body.reason,
          }),
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        },
      });
    }

    res.json({
      success: result.success,
      statusCode: result.statusCode,
      statusMsg: result.statusMsg,
      errorDescription: result.errorDescription,
    });
  } catch (err) {
    next(err);
  }
});

// ============================================
// Loan signing endpoints
// ============================================

const signAgreementSchema = z.object({
  loanId: z.string().min(1),
  pin: z.string().min(1),
  signatureImage: z.string().min(1),
  role: z.enum(['COMPANY_REP', 'WITNESS']),
});

router.post('/sign-agreement', requireAgreementSigning, async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.user!.userId;
    const body = signAgreementSchema.parse(req.body);

    const profile = await prisma.staffSigningProfile.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });
    if (!profile || !profile.certSerialNo) {
      throw new BadRequestError('You need a valid signing certificate. Go to Signing Certificates to set up.');
    }
    if (profile.certStatus !== 'Valid') {
      throw new BadRequestError(`Your certificate status is "${profile.certStatus}". A valid certificate is required.`);
    }

    const loan = await prisma.loan.findFirst({
      where: { id: body.loanId, tenantId },
      include: {
        tenant: { select: { name: true, registrationNumber: true } },
        internalSignatures: true,
      },
    });
    if (!loan) {
      throw new NotFoundError('Loan not found');
    }
    if (loan.loanChannel !== 'ONLINE') {
      throw new BadRequestError('Internal signing is only available for online-originated loans');
    }
    if (!loan.agreementPath) {
      throw new BadRequestError('No signed agreement found. Borrower must sign first.');
    }

    const existingSig = loan.internalSignatures.find(s => s.role === body.role);
    if (existingSig) {
      throw new BadRequestError(`This loan has already been signed for role "${body.role}"`);
    }

    const pinResult = await verifyCertPin(profile.icNumber, profile.certSerialNo, body.pin);
    if (!pinResult.success || pinResult.certPinStatus !== 'Valid') {
      res.json({
        success: false,
        statusCode: pinResult.statusCode,
        statusMsg: pinResult.statusMsg || 'PIN verification failed',
        errorDescription: pinResult.errorDescription || `PIN status: ${pinResult.certPinStatus || 'Invalid'}`,
      });
      return;
    }

    const sigFields = (loan.agreementSignatureFields as SignatureFieldMeta[] | null) || [];
    if (sigFields.length === 0) {
      throw new BadRequestError(
        'Signature field coordinates are missing. The borrower must re-sign the agreement with the latest version.'
      );
    }
    const roleKey = body.role === 'COMPANY_REP' ? 'company_rep' : 'witness';
    const sigField = sigFields.find(f => f.role === roleKey);
    if (!sigField) {
      throw new BadRequestError(`No signature field found for role "${body.role}" in the agreement. Available: ${sigFields.map(f => f.role).join(', ')}`);
    }

    const currentPdf = await getFile(loan.agreementPath);
    if (!currentPdf) {
      throw new NotFoundError('Agreement PDF not found');
    }
    const pdfBase64 = currentPdf.toString('base64');

    let sigImage = body.signatureImage;
    if (sigImage.includes(',')) {
      sigImage = sigImage.split(',')[1];
    }

    const signResult = await signAndStorePdf({
      UserID: profile.icNumber,
      FullName: profile.fullName,
      AuthFactor: body.pin,
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
    const signedFilename = loan.agreementFilename || `signed-agreement-${body.loanId}.pdf`;

    const { path: agreementPath, filename: storedFilename } = await saveAgreementFile(
      signedPdfBuffer,
      body.loanId,
      signedFilename,
    );

    // Save signature image
    const sigImageBuffer = Buffer.from(sigImage, 'base64');
    const { path: signaturePath } = await saveFile(
      sigImageBuffer,
      'internal-signatures',
      body.loanId,
      `${body.role.toLowerCase()}-signature-${body.loanId.substring(0, 8)}.png`,
    );

    const newVersion = loan.agreementVersion + 1;

    await prisma.$transaction(async (tx) => {
      await tx.loan.update({
        where: { id: body.loanId },
        data: {
          agreementPath,
          agreementFilename: storedFilename,
          agreementSize: signedPdfBuffer.length,
          agreementUploadedAt: new Date(),
          agreementVersion: newVersion,
        },
      });

      await tx.loanInternalSignature.create({
        data: {
          loanId: body.loanId,
          tenantId,
          role: body.role,
          userId,
          signerName: profile.fullName,
          signerIc: profile.icNumber,
          signaturePath,
          agreementVersion: newVersion,
          pageNo: sigField.pageNo,
          x1: sigField.x1,
          y1: sigField.y1,
          x2: sigField.x2,
          y2: sigField.y2,
        },
      });

      // Check if both signatures are now present
      const allSigs = await tx.loanInternalSignature.findMany({
        where: { loanId: body.loanId },
      });
      const hasCompanyRep = allSigs.some(s => s.role === 'COMPANY_REP');
      const hasWitness = allSigs.some(s => s.role === 'WITNESS');

      if (hasCompanyRep && hasWitness) {
        await tx.loan.update({
          where: { id: body.loanId },
          data: {
            signedAgreementReviewStatus: 'APPROVED',
            signedAgreementReviewedAt: new Date(),
            signedAgreementReviewerMemberId: req.memberId,
            signedAgreementReviewNotes: 'Auto-approved after both internal signatures applied',
          },
        });
      }
    });

    await AuditService.log({
      tenantId,
      action: `INTERNAL_SIGN_${body.role}`,
      entityType: 'Loan',
      entityId: body.loanId,
      newData: {
        role: body.role,
        signerName: profile.fullName,
        signerIc: profile.icNumber,
        agreementVersion: newVersion,
        signaturePath,
      },
      ipAddress: req.ip,
    });

    // Reload to check status
    const updatedLoan = await prisma.loan.findUnique({
      where: { id: body.loanId },
      select: { signedAgreementReviewStatus: true },
    });

    if (updatedLoan?.signedAgreementReviewStatus === 'APPROVED') {
      await AuditService.log({
        tenantId,
        action: 'LOAN_AUTO_APPROVED',
        entityType: 'Loan',
        entityId: body.loanId,
        newData: {
          reason: 'All internal signatures (company rep + witness) applied',
          agreementVersion: newVersion,
        },
        ipAddress: req.ip,
      });
    }

    res.json({
      success: true,
      role: body.role,
      agreementVersion: newVersion,
      signedAgreementReviewStatus: updatedLoan?.signedAgreementReviewStatus,
    });
  } catch (err) {
    next(err);
  }
});

// List all staff signing profiles for the tenant
router.get('/signers', requirePermission('signing_certificates.view'), async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;

    const profiles = await prisma.staffSigningProfile.findMany({
      where: { tenantId },
      select: {
        id: true,
        userId: true,
        fullName: true,
        icNumber: true,
        email: true,
        designation: true,
        certStatus: true,
        certSerialNo: true,
        certValidFrom: true,
        certValidTo: true,
        kycComplete: true,
        user: { select: { name: true, email: true } },
      },
      orderBy: { fullName: 'asc' },
    });

    res.json({ success: true, signers: profiles });
  } catch (err) {
    next(err);
  }
});

// Delete a signing profile (DB only — does NOT revoke the certificate).
// Cascade deletes associated KYC sessions and documents.
router.delete('/signers/:profileId', requirePermission('signing_certificates.manage'), async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.user!.userId;
    const profileId = req.params.profileId as string;

    const profile = await prisma.staffSigningProfile.findFirst({
      where: { id: profileId, tenantId },
    });
    if (!profile) {
      throw new NotFoundError('Signing profile not found');
    }

    await prisma.staffSigningProfile.delete({ where: { id: profileId } });

    await AuditService.log({
      tenantId,
      action: 'STAFF_PROFILE_DELETED',
      entityType: 'StaffSigningProfile',
      entityId: profileId,
      newData: {
        deletedBy: userId,
        fullName: profile.fullName,
        icNumber: profile.icNumber,
        certStatus: profile.certStatus,
      },
      ipAddress: req.ip,
    });

    await prisma.adminAuditLog.create({
      data: {
        userId,
        tenantId,
        action: 'STAFF_PROFILE_DELETED',
        targetId: profileId,
        targetType: 'StaffSigningProfile',
        details: JSON.stringify({
          fullName: profile.fullName,
          icNumber: profile.icNumber,
          certStatus: profile.certStatus,
        }),
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// Get internal signatures for a loan
router.get(
  '/loan-signatures/:loanId',
  requireAnyPermission('agreements.view', 'attestation.view'),
  async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;
    const loanId = req.params.loanId as string;

    const signatures = await prisma.loanInternalSignature.findMany({
      where: { loanId, tenantId },
      select: {
        id: true,
        role: true,
        signerName: true,
        signerIc: true,
        signedAt: true,
        agreementVersion: true,
        userId: true,
      },
    });

    res.json({ success: true, signatures });
  } catch (err) {
    next(err);
  }
});

// ============================================
// PIN Management
// ============================================

router.post('/verify-pin', requireSigningCertificatesManage, async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.user!.userId;

    const profile = await prisma.staffSigningProfile.findFirst({
      where: { tenantId, userId },
    });

    if (!profile) {
      throw new NotFoundError('Signing profile not found');
    }
    if (!profile.certSerialNo) {
      throw new BadRequestError('No certificate serial number on record');
    }

    const parsed = z.object({ pin: certPinManagementSchema }).safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('PIN must be 4–32 digits (numbers only)');
    }
    const { pin } = parsed.data;

    const result = await verifyCertPin(profile.icNumber, profile.certSerialNo, pin);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/reset-pin', requireSigningCertificatesManage, async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.user!.userId;

    const profile = await prisma.staffSigningProfile.findFirst({
      where: { tenantId, userId },
    });

    if (!profile) {
      throw new NotFoundError('Signing profile not found');
    }
    if (!profile.certSerialNo) {
      throw new BadRequestError('No certificate serial number on record');
    }

    const parsed = z
      .object({
        currentPin: certPinManagementSchema,
        newPin: certPinManagementSchema,
      })
      .safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Current and new PIN must each be 4–32 digits (numbers only)');
    }
    const { currentPin, newPin } = parsed.data;

    const pinCheck = await verifyCertPin(profile.icNumber, profile.certSerialNo, currentPin);
    if (!pinCheck.success || pinCheck.certPinStatus !== 'Valid') {
      res.json({
        success: false,
        statusCode: pinCheck.statusCode,
        statusMsg: 'Current PIN is incorrect',
        errorDescription: pinCheck.errorDescription || 'PIN verification failed',
      });
      return;
    }

    const result = await resetCertPin(profile.icNumber, profile.certSerialNo, newPin);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ============================================
// PDF Signature Verification
// ============================================

router.post('/verify-pdf', async (req, res, next) => {
  try {
    const { pdfBase64 } = req.body;
    if (!pdfBase64) {
      throw new BadRequestError('pdfBase64 is required');
    }

    const result = await verifyPdfSignature(pdfBase64);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
