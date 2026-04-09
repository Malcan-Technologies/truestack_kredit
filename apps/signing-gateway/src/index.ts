import express from 'express';
import cors from 'cors';
import { config, validateConfig } from './config.js';
import { authenticateApiKey } from './middleware/auth.js';
import healthRouter from './routes/health.js';
import apiRouter from './routes/api.js';

validateConfig();

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(authenticateApiKey);

app.use('/health', healthRouter);
app.use('/api', apiRouter);

app.listen(config.port, () => {
  console.log(`[SigningGateway] Listening on port ${config.port}`);
  console.log(`[SigningGateway] MTSA URL: ${config.mtsa.url}`);
  console.log(`[SigningGateway] Environment: ${config.nodeEnv}`);
});
