import jwt from 'jsonwebtoken';
import { config } from './config.js';

// Role is stored as string for Better Auth compatibility
export type UserRole = 'OWNER' | 'ADMIN' | 'STAFF';

export interface TokenPayload {
  userId: string;
  tenantId: string;
  email: string;
  role: UserRole;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * Generate access and refresh tokens
 */
export function generateTokens(payload: TokenPayload): TokenPair {
  const accessToken = jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.accessExpiry as jwt.SignOptions['expiresIn'],
  });

  const refreshToken = jwt.sign(
    { userId: payload.userId, tenantId: payload.tenantId },
    config.jwt.refreshSecret,
    { expiresIn: config.jwt.refreshExpiry as jwt.SignOptions['expiresIn'] }
  );

  return { accessToken, refreshToken };
}

/**
 * Verify access token
 */
export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, config.jwt.secret) as TokenPayload;
}

/**
 * Verify refresh token
 */
export function verifyRefreshToken(token: string): { userId: string; tenantId: string } {
  return jwt.verify(token, config.jwt.refreshSecret) as { userId: string; tenantId: string };
}

/**
 * Extract token from Authorization header
 */
export function extractToken(authHeader: string | undefined): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7);
}
