import { Router } from 'express';
import { healthCheck } from '../services/MTSAClient.js';
import { resolvePublicFooterIpv4 } from '../services/publicFooterIp.js';

const router = Router();

router.get('/', async (_req, res) => {
  const mtsaOk = await healthCheck();

  const status = mtsaOk ? 'healthy' : 'degraded';
  const httpStatus = mtsaOk ? 200 : 503;

  const publicIpv4 = await resolvePublicFooterIpv4();

  res.status(httpStatus).json({
    status,
    timestamp: new Date().toISOString(),
    services: {
      mtsa: mtsaOk ? 'connected' : 'unreachable',
    },
    /** Egress public IPv4 (SIGNING_GATEWAY_PUBLIC_IP or api.ipify.org), not container private IP. */
    publicIpv4,
  });
});

export default router;
