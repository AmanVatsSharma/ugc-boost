/**
 * File:        api/src/models/prisma.ts
 * Module:      Database · Prisma Client
 * Purpose:     Initialize and export Prisma client singleton
 *
 * Exports:
 *   - prisma — Prisma client instance for database operations
 *
 * Depends on:
 *   - @prisma/client — ORM client
 *
 * Side-effects:
 *   - Database connection on import
 *
 * Key invariants:
 *   - Single Prisma client instance (prevents connection exhaustion)
 *   - Disconnect on process termination
 *
 * Author:      UGC Boost Team
 * Last-updated: 2026-05-12
 */

import { PrismaClient } from '@prisma/client';

declare global {
  var prisma: PrismaClient | undefined;
}

export const prisma = global.prisma || new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

// Graceful shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

export default prisma;