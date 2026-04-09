import type { Request, Response, NextFunction } from 'express';
import { config } from '../config.js';

export function authenticateApiKey(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (req.path === '/health') {
    next();
    return;
  }

  const apiKey =
    req.headers['x-api-key'] as string | undefined;

  if (!apiKey || apiKey !== config.signingApiKey) {
    res.status(401).json({ error: 'Invalid or missing API key' });
    return;
  }

  next();
}
