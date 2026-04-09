import { Router } from 'express';
import { healthCheck } from '../services/MTSAClient.js';

const router = Router();

router.get('/', async (_req, res) => {
  const mtsaOk = await healthCheck();

  const status = mtsaOk ? 'healthy' : 'degraded';
  const httpStatus = mtsaOk ? 200 : 503;

  res.status(httpStatus).json({
    status,
    timestamp: new Date().toISOString(),
    services: {
      mtsa: mtsaOk ? 'connected' : 'unreachable',
    },
  });
});

export default router;
