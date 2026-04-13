import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { authenticateToken } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/requireRole.js';
import { getFile } from '../../lib/storage.js';
import {
  checkHealth,
  checkOnPremDocuments,
  restoreOnPremDocument,
} from '../../lib/signingGatewayClient.js';

const router = Router();
router.use(authenticateToken);

router.get('/', requirePermission('agreements.view'), async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;

    const loans = await prisma.loan.findMany({
      where: {
        tenantId,
        agreementPath: { not: null },
      },
      select: {
        id: true,
        agreementPath: true,
        agreementFilename: true,
        agreementOriginalName: true,
        agreementSize: true,
        agreementUploadedAt: true,
        agreementVersion: true,
        borrowerSignedAgreementPath: true,
        loanChannel: true,
        status: true,
        borrower: {
          select: {
            id: true,
            name: true,
            icNumber: true,
          },
        },
      },
      orderBy: { agreementUploadedAt: 'desc' },
    });

    const onlineLoanIds = loans
      .filter((l) => l.loanChannel === 'ONLINE' && l.agreementPath)
      .map((l) => l.id);

    let onPremAvailability: Record<string, boolean> = {};
    let gatewayOnline = false;

    try {
      const health = await checkHealth();
      gatewayOnline = health.online;

      if (gatewayOnline && onlineLoanIds.length > 0) {
        const checkResult = await checkOnPremDocuments(onlineLoanIds);
        if (checkResult.success) {
          onPremAvailability = checkResult.availability;
        }
      }
    } catch {
      gatewayOnline = false;
    }

    const agreements = loans.map((loan) => {
      const isOnline = loan.loanChannel === 'ONLINE';
      return {
        loanId: loan.id,
        borrowerName: loan.borrower.name,
        borrowerIc: loan.borrower.icNumber,
        filename: loan.agreementOriginalName || loan.agreementFilename,
        fileSize: loan.agreementSize,
        uploadedAt: loan.agreementUploadedAt,
        version: loan.agreementVersion,
        loanStatus: loan.status,
        loanChannel: loan.loanChannel,
        hasBackup: !!loan.agreementPath,
        onPremAvailable: isOnline ? (onPremAvailability[loan.id] ?? null) : null,
        hasBorrowerSigned: !!loan.borrowerSignedAgreementPath,
      };
    });

    res.json({
      success: true,
      gatewayOnline,
      agreements,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:loanId/sync', requirePermission('agreements.manage'), async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;
    const loanId = req.params.loanId as string;

    const loan = await prisma.loan.findFirst({
      where: { id: loanId, tenantId, agreementPath: { not: null } },
      select: { id: true, agreementPath: true },
    });

    if (!loan || !loan.agreementPath) {
      res.status(404).json({ success: false, error: 'Agreement not found' });
      return;
    }

    const fileBuffer = await getFile(loan.agreementPath);
    if (!fileBuffer) {
      res.status(404).json({ success: false, error: 'Backup file not found' });
      return;
    }

    const pdfBase64 = fileBuffer.toString('base64');
    const result = await restoreOnPremDocument(loanId, pdfBase64);

    if (!result.success) {
      res.status(502).json({ success: false, error: result.error || 'Restore failed' });
      return;
    }

    res.json({ success: true, loanId, document: result.document });
  } catch (err) {
    next(err);
  }
});

router.post('/sync-batch', requirePermission('agreements.manage'), async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;
    const { loanIds } = req.body;

    if (!Array.isArray(loanIds) || loanIds.length === 0) {
      res.status(400).json({ success: false, error: 'loanIds array is required' });
      return;
    }

    const loans = await prisma.loan.findMany({
      where: {
        id: { in: loanIds },
        tenantId,
        agreementPath: { not: null },
      },
      select: { id: true, agreementPath: true },
    });

    const results: Array<{ loanId: string; success: boolean; error?: string }> = [];

    for (const loan of loans) {
      try {
        if (!loan.agreementPath) {
          results.push({ loanId: loan.id, success: false, error: 'No backup path' });
          continue;
        }

        const fileBuffer = await getFile(loan.agreementPath);
        if (!fileBuffer) {
          results.push({ loanId: loan.id, success: false, error: 'Backup file not found' });
          continue;
        }

        const pdfBase64 = fileBuffer.toString('base64');
        const restoreResult = await restoreOnPremDocument(loan.id, pdfBase64);

        if (restoreResult.success) {
          results.push({ loanId: loan.id, success: true });
        } else {
          results.push({ loanId: loan.id, success: false, error: restoreResult.error || 'Restore failed' });
        }
      } catch (err: any) {
        results.push({ loanId: loan.id, success: false, error: err.message });
      }
    }

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    res.json({ success: true, total: results.length, succeeded, failed, results });
  } catch (err) {
    next(err);
  }
});

export default router;
