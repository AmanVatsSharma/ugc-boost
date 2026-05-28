/**
 * File:        api/src/index.ts
 * Module:      API · Server Entry Point
 * Purpose:     Express server initialization with all middleware and routes
 *
 * Exports:
 *   - app — Express application instance
 *   - server — HTTP server (for testing)
 *
 * Depends on:
 *   - express — Web framework
 *   - ./routes/* — API route handlers
 *   - ./models/prisma — Database client
 *
 * Side-effects:
 *   - Starts HTTP server on configured port
 *   - Connects to PostgreSQL database
 *
 * Key invariants:
 *   - Webhooks mounted at /api/webhooks/*
 *   - API routes mounted at /api/*
 *   - CORS configured for Shopify admin
 *
 * Author:      UGC Boost Team
 * Last-updated: 2026-05-12
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

import webhooksRouter from './routes/webhooks';
import ugcRouter from './routes/ugc';
import aiRouter from './routes/ai';
import analyticsRouter from './routes/analytics';

// Load environment variables
dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable for API
}));

// CORS configuration for Shopify
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || [
    /\.myshopify\.com$/,
    /localhost:/,
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Shopify-Shop-Domain',
    'X-Shopify-Topic',
    'X-Shop-Hmac-Sha256',
    'X-Shop-Id',
  ],
}));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  message: { error: 'Too many webhook requests' },
});

// Apply rate limits
app.use('/api/', apiLimiter);
app.use('/api/webhooks/', webhookLimiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging (development)
if (process.env.NODE_ENV === 'development') {
  app.use((req: Request, _res: Response, next: NextFunction) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
    next();
  });
}

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
  });
});

// Mount routes
app.use('/api/webhooks', webhooksRouter);
app.use('/api/ugc', ugcRouter);
app.use('/api/ai', aiRouter);
app.use('/api/analytics', analyticsRouter);

// Error handling middleware
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err);

  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not found',
    message: 'The requested endpoint does not exist',
  });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`
  ╔════════════════════════════════════════════╗
  ║         UGC Boost API Server               ║
  ║════════════════════════════════════════════║
  ║  Status:    Running                         ║
  ║  Port:      ${PORT}                            ║
  ║  Env:       ${(process.env.NODE_ENV || 'development').padEnd(22)}║
  ╚════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export { app, server };
export default app;