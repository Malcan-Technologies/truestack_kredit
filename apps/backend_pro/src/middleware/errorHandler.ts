import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';
import { config } from '../lib/config.js';

/**
 * Global error handler middleware
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log error (skip 401 Unauthorized - expected for unauthenticated requests)
  if (!(err instanceof AppError) || err.statusCode !== 401) {
    console.error(`[Error] ${err.name}: ${err.message}`);
    if (config.nodeEnv === 'development') {
      console.error(err.stack);
    }
  }

  // Handle known errors
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
      code: err.code,
    });
    return;
  }

  // Handle Prisma errors
  if (err.name === 'PrismaClientKnownRequestError') {
    res.status(400).json({
      success: false,
      error: 'Database operation failed',
      code: 'DATABASE_ERROR',
    });
    return;
  }

  // Handle validation errors (Zod)
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: err.issues,
    });
    return;
  }

  // Handle unknown errors
  res.status(500).json({
    success: false,
    error: config.nodeEnv === 'production' 
      ? 'Internal server error' 
      : err.message,
    code: 'INTERNAL_ERROR',
  });
}
