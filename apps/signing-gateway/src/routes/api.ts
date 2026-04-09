import { Router } from 'express';
import * as mtsa from '../services/MTSAClient.js';
import { enrichResponse } from '../statusCodes.js';
import {
  storeSignedPdf,
  getLatestSignedPdf,
  listAllDocuments,
  checkDocumentsExist,
  restoreSignedPdf,
} from '../services/documentStorage.js';
import type {
  GetCertInfoRequest,
  RequestEmailOTPRequest,
  RequestSMSOTPRequest,
  VerifyCertPinRequest,
  RequestCertificateRequest,
  SignPDFRequest,
  VerifyPDFSignatureRequest,
  RequestRevokeCertRequest,
  ResetCertificatePinRequest,
  UpdateEmailAddressRequest,
  UpdateMobileNoRequest,
} from '../types/index.js';

const router = Router();

// ---- Certificate Operations ----

router.post('/cert/info', async (req, res) => {
  try {
    const body: GetCertInfoRequest = req.body;
    if (!body.UserID) {
      res.status(400).json({ success: false, error: 'UserID is required' });
      return;
    }
    const result = await mtsa.getCertInfo(body);
    res.json(enrichResponse(result));
  } catch (err: any) {
    console.error('[API] /cert/info error:', err.message);
    res.status(502).json({ success: false, error: 'MTSA call failed', detail: err.message });
  }
});

router.post('/cert/enroll', async (req, res) => {
  try {
    const body: RequestCertificateRequest = req.body;
    if (!body.UserID || !body.FullName || !body.EmailAddress) {
      res
        .status(400)
        .json({ success: false, error: 'UserID, FullName, and EmailAddress are required' });
      return;
    }
    const result = await mtsa.requestCertificate(body);
    res.json(enrichResponse(result));
  } catch (err: any) {
    console.error('[API] /cert/enroll error:', err.message);
    res.status(502).json({ success: false, error: 'MTSA call failed', detail: err.message });
  }
});

router.post('/cert/revoke', async (req, res) => {
  try {
    const body: RequestRevokeCertRequest = req.body;
    if (!body.UserID || !body.CertSerialNo || !body.RevokeReason) {
      res.status(400).json({
        success: false,
        error: 'UserID, CertSerialNo, and RevokeReason are required',
      });
      return;
    }
    const result = await mtsa.requestRevokeCert(body);
    res.json(enrichResponse(result));
  } catch (err: any) {
    console.error('[API] /cert/revoke error:', err.message);
    res.status(502).json({ success: false, error: 'MTSA call failed', detail: err.message });
  }
});

router.post('/cert/verify-pin', async (req, res) => {
  try {
    const body: VerifyCertPinRequest = req.body;
    if (!body.UserID || !body.CertSerialNo || !body.CertPin) {
      res
        .status(400)
        .json({ success: false, error: 'UserID, CertSerialNo, and CertPin are required' });
      return;
    }
    const result = await mtsa.verifyCertPin(body);
    res.json(enrichResponse(result));
  } catch (err: any) {
    console.error('[API] /cert/verify-pin error:', err.message);
    res.status(502).json({ success: false, error: 'MTSA call failed', detail: err.message });
  }
});

router.post('/cert/reset-pin', async (req, res) => {
  try {
    const body: ResetCertificatePinRequest = req.body;
    if (!body.UserID || !body.CertSerialNo || !body.NewPin) {
      res
        .status(400)
        .json({ success: false, error: 'UserID, CertSerialNo, and NewPin are required' });
      return;
    }
    const result = await mtsa.resetCertificatePin(body);
    res.json(enrichResponse(result));
  } catch (err: any) {
    console.error('[API] /cert/reset-pin error:', err.message);
    res.status(502).json({ success: false, error: 'MTSA call failed', detail: err.message });
  }
});

// ---- OTP Operations ----

router.post('/otp/request-email', async (req, res) => {
  try {
    const body: RequestEmailOTPRequest = req.body;
    if (!body.UserID || !body.OTPUsage) {
      res.status(400).json({ success: false, error: 'UserID and OTPUsage are required' });
      return;
    }
    const result = await mtsa.requestEmailOTP(body);
    res.json(enrichResponse(result));
  } catch (err: any) {
    console.error('[API] /otp/request-email error:', err.message);
    res.status(502).json({ success: false, error: 'MTSA call failed', detail: err.message });
  }
});

router.post('/otp/request-sms', async (req, res) => {
  try {
    const body: RequestSMSOTPRequest = req.body;
    if (!body.UserID || !body.OTPUsage) {
      res.status(400).json({ success: false, error: 'UserID and OTPUsage are required' });
      return;
    }
    const result = await mtsa.requestSMSOTP(body);
    res.json(enrichResponse(result));
  } catch (err: any) {
    console.error('[API] /otp/request-sms error:', err.message);
    res.status(502).json({ success: false, error: 'MTSA call failed', detail: err.message });
  }
});

// Keep the old /otp/request path as an alias for /otp/request-email
router.post('/otp/request', async (req, res) => {
  try {
    const body: RequestEmailOTPRequest = req.body;
    if (!body.UserID || !body.OTPUsage) {
      res.status(400).json({ success: false, error: 'UserID and OTPUsage are required' });
      return;
    }
    const result = await mtsa.requestEmailOTP(body);
    res.json(enrichResponse(result));
  } catch (err: any) {
    console.error('[API] /otp/request error:', err.message);
    res.status(502).json({ success: false, error: 'MTSA call failed', detail: err.message });
  }
});

// ---- Signing Operations ----

router.post('/sign', async (req, res) => {
  try {
    const body: SignPDFRequest = req.body;
    if (!body.UserID || !body.FullName || !body.AuthFactor || !body.SignatureInfo) {
      res.status(400).json({
        success: false,
        error: 'UserID, FullName, AuthFactor, and SignatureInfo are required',
      });
      return;
    }
    const result = await mtsa.signPDF(body);
    res.json(enrichResponse(result));
  } catch (err: any) {
    console.error('[API] /sign error:', err.message);
    res.status(502).json({ success: false, error: 'MTSA call failed', detail: err.message });
  }
});

router.post('/verify', async (req, res) => {
  try {
    const body: VerifyPDFSignatureRequest = req.body;
    if (!body.SignedPdfInBase64) {
      res.status(400).json({ success: false, error: 'SignedPdfInBase64 is required' });
      return;
    }
    const result = await mtsa.verifyPDFSignature(body);
    res.json(enrichResponse(result));
  } catch (err: any) {
    console.error('[API] /verify error:', err.message);
    res.status(502).json({ success: false, error: 'MTSA call failed', detail: err.message });
  }
});

// ---- Contact Update Operations ----

router.post('/email/update', async (req, res) => {
  try {
    const body: UpdateEmailAddressRequest = req.body;
    if (!body.UserID || !body.NewEmailAddress || !body.EmailOTP) {
      res.status(400).json({
        success: false,
        error: 'UserID, NewEmailAddress, and EmailOTP are required',
      });
      return;
    }
    const result = await mtsa.updateEmailAddress(body);
    res.json(enrichResponse(result));
  } catch (err: any) {
    console.error('[API] /email/update error:', err.message);
    res.status(502).json({ success: false, error: 'MTSA call failed', detail: err.message });
  }
});

router.post('/mobile/update', async (req, res) => {
  try {
    const body: UpdateMobileNoRequest = req.body;
    if (!body.UserID || !body.NewMobileNo || !body.SMSOTP) {
      res.status(400).json({
        success: false,
        error: 'UserID, NewMobileNo, and SMSOTP are required',
      });
      return;
    }
    const result = await mtsa.updateMobileNo(body);
    res.json(enrichResponse(result));
  } catch (err: any) {
    console.error('[API] /mobile/update error:', err.message);
    res.status(502).json({ success: false, error: 'MTSA call failed', detail: err.message });
  }
});

// ---- Combined Sign + Store Operations ----

router.post('/sign-and-store', async (req, res) => {
  try {
    const { UserID, FullName, AuthFactor, SignatureInfo, loanId } = req.body;
    if (!UserID || !FullName || !AuthFactor || !SignatureInfo || !loanId) {
      res.status(400).json({
        success: false,
        error: 'UserID, FullName, AuthFactor, SignatureInfo, and loanId are required',
      });
      return;
    }

    const signRequest: SignPDFRequest = { UserID, FullName, AuthFactor, SignatureInfo };
    const signResult = await mtsa.signPDF(signRequest);
    const enriched = enrichResponse(signResult);

    if (!enriched.success || !signResult.signedPdfInBase64) {
      res.json(enriched);
      return;
    }

    const { metadata } = storeSignedPdf(loanId, signResult.signedPdfInBase64, {
      loanId,
      signerUserId: UserID,
      signerName: FullName,
      originalName: `signed-agreement-${loanId}.pdf`,
    });

    res.json({
      ...enriched,
      signedPdfInBase64: signResult.signedPdfInBase64,
      document: {
        loanId,
        filename: metadata.filename,
        sizeBytes: metadata.sizeBytes,
        signedAt: metadata.signedAt,
      },
    });
  } catch (err: any) {
    console.error('[API] /sign-and-store error:', err.message);
    res.status(502).json({ success: false, error: 'Signing failed', detail: err.message });
  }
});

// ---- Document Management ----

router.get('/documents', async (_req, res) => {
  try {
    const documents = listAllDocuments();
    res.json({ success: true, documents });
  } catch (err: any) {
    console.error('[API] /documents error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to list documents' });
  }
});

router.post('/documents/check', async (req, res) => {
  try {
    const { loanIds } = req.body;
    if (!Array.isArray(loanIds)) {
      res.status(400).json({ success: false, error: 'loanIds must be an array' });
      return;
    }
    const availability = checkDocumentsExist(loanIds);
    res.json({ success: true, availability });
  } catch (err: any) {
    console.error('[API] /documents/check error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to check documents' });
  }
});

router.post('/documents/:loanId/restore', async (req, res) => {
  try {
    const { loanId } = req.params;
    const { pdfBase64 } = req.body;
    if (!pdfBase64) {
      res.status(400).json({ success: false, error: 'pdfBase64 is required' });
      return;
    }
    const pdfBuffer = Buffer.from(pdfBase64, 'base64');
    const { metadata } = restoreSignedPdf(loanId, pdfBuffer);
    res.json({ success: true, document: metadata });
  } catch (err: any) {
    console.error('[API] /documents/:loanId/restore error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to restore document' });
  }
});

// ---- Document Retrieval ----

router.get('/documents/:loanId/signed', async (req, res) => {
  try {
    const { loanId } = req.params;
    const doc = getLatestSignedPdf(loanId);
    if (!doc) {
      res.status(404).json({ success: false, error: 'No signed document found for this loan' });
      return;
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="signed-agreement-${loanId}.pdf"`);
    res.setHeader('Content-Length', doc.buffer.length);
    res.send(doc.buffer);
  } catch (err: any) {
    console.error('[API] /documents/:loanId/signed error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to retrieve document' });
  }
});

export default router;
