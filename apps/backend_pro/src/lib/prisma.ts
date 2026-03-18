import { PrismaClient } from '@prisma/client';
import { config } from './config.js';

// Create a single Prisma client instance
export const prisma = new PrismaClient({
  log: config.nodeEnv === 'development' 
    ? ['query', 'info', 'warn', 'error'] 
    : ['warn', 'error'],
});
