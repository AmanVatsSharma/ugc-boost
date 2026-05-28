/**
 * File:        api/src/routes/ai.ts
 * Module:      API · AI Routes
 * Purpose:     Image tagging and AI-powered features
 *
 * Exports:
 *   - router — Express router with AI endpoints
 *
 * Depends on:
 *   - express — Router
 *   - ../models/prisma — Database client
 *   - ../services/imageTagging — OpenAI integration
 *
 * Side-effects:
 *   - Makes API calls to OpenAI
 *   - Updates UGC items with AI-generated tags
 *
 * Key invariants:
 *   - Pro tier required for AI features
 *   - Rate limited to prevent API abuse
 *
 * Author:      UGC Boost Team
 * Last-updated: 2026-05-12
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../models/prisma';
import {
  tagImage,
  batchTagImages,
  detectProducts,
  detectStyle,
  generateCaption,
  analyzeSentiment,
} from '../services/imageTagging';

const router = Router();

// Validation schemas
const TagRequestSchema = z.object({
  imageUrl: z.string().url(),
  ugcItemId: z.string().optional(),
});

const BatchTagSchema = z.object({
  imageUrls: z.array(z.string().url()).min(1).max(20),
  ugcItemIds: z.array(z.string()).optional(),
});

// Helper: Check if shop has Pro tier
async function checkProTier(shopId: string): Promise<boolean> {
  const subscription = await prisma.subscription.findFirst({
    where: { shopId },
  });
  return subscription?.tier !== 'free';
}

// Rate limiting map (in production, use Redis)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 20; // requests per minute
const RATE_WINDOW = 60 * 1000; // 1 minute

function checkRateLimit(shopId: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(shopId);

  if (!record || now > record.resetAt) {
    rateLimitMap.set(shopId, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }

  if (record.count >= RATE_LIMIT) {
    return false;
  }

  record.count++;
  return true;
}

// Tag a single image with AI
router.post('/tag', async (req: Request, res: Response) => {
  try {
    // Get shop ID from header or body
    const shopId = req.headers['x-shop-id'] as string || req.body.shopId;

    if (!shopId) {
      return res.status(400).json({ error: 'Shop ID required' });
    }

    // Check Pro tier
    const isPro = await checkProTier(shopId);
    if (!isPro) {
      return res.status(403).json({
        error: 'Pro tier required',
        message: 'AI tagging is a Pro feature',
        upgradeUrl: '/settings?upgrade=pro',
      });
    }

    // Check rate limit
    if (!checkRateLimit(shopId)) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: 'Please wait before making more requests',
        retryAfter: 60,
      });
    }

    const validation = TagRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Invalid request',
        details: validation.error.errors,
      });
    }

    const { imageUrl, ugcItemId } = validation.data;

    // Tag the image
    const result = await tagImage(imageUrl);

    // If UGC item ID provided, save tags to database
    if (ugcItemId) {
      // Delete existing auto-generated tags
      await prisma.tag.deleteMany({
        where: { ugcItemId },
      });

      // Create new tags
      if (result.tags.length > 0) {
        await prisma.tag.createMany({
          data: result.tags.map((tag) => ({
            ugcItemId,
            name: tag,
          })),
          skipDuplicates: true,
        });
      }

      // Update UGC item with detected products
      await prisma.uGCItem.update({
        where: { id: ugcItemId },
        data: {
          tags: {
            connect: [], // Clear existing
          },
        },
      });
    }

    res.json({
      success: true,
      data: {
        tags: result.tags,
        detectedProducts: result.detectedProducts,
        detectedStyle: result.detectedStyle,
        confidence: result.confidence,
      },
    });
  } catch (error) {
    console.error('Tag error:', error);
    res.status(500).json({ error: 'Failed to analyze image' });
  }
});

// Batch tag multiple images (Pro only)
router.post('/tag/batch', async (req: Request, res: Response) => {
  try {
    const shopId = req.headers['x-shop-id'] as string || req.body.shopId;

    if (!shopId) {
      return res.status(400).json({ error: 'Shop ID required' });
    }

    const isPro = await checkProTier(shopId);
    if (!isPro) {
      return res.status(403).json({
        error: 'Pro tier required',
        message: 'Batch tagging is a Pro feature',
        upgradeUrl: '/settings?upgrade=pro',
      });
    }

    if (!checkRateLimit(shopId)) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: 'Please wait before making more requests',
        retryAfter: 60,
      });
    }

    const validation = BatchTagSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Invalid request',
        details: validation.error.errors,
      });
    }

    const { imageUrls, ugcItemIds } = validation.data;

    // Process in batches
    const results = await batchTagImages(imageUrls, { concurrency: 3 });

    // Save tags to database if UGC item IDs provided
    if (ugcItemIds && ugcItemIds.length === imageUrls.length) {
      for (let i = 0; i < ugcItemIds.length; i++) {
        const ugcItemId = ugcItemIds[i];
        const result = results[i];

        if (result.tags.length > 0) {
          await prisma.tag.createMany({
            data: result.tags.map((tag) => ({
              ugcItemId,
              name: tag,
            })),
            skipDuplicates: true,
          });
        }
      }
    }

    res.json({
      success: true,
      data: results.map((result, index) => ({
        imageUrl: imageUrls[index],
        ugcItemId: ugcItemIds?.[index],
        tags: result.tags,
        detectedProducts: result.detectedProducts,
        detectedStyle: result.detectedStyle,
        confidence: result.confidence,
      })),
    });
  } catch (error) {
    console.error('Batch tag error:', error);
    res.status(500).json({ error: 'Failed to batch analyze images' });
  }
});

// Detect products in image
router.post('/detect-products', async (req: Request, res: Response) => {
  try {
    const shopId = req.headers['x-shop-id'] as string || req.body.shopId;

    if (!shopId) {
      return res.status(400).json({ error: 'Shop ID required' });
    }

    const isPro = await checkProTier(shopId);
    if (!isPro) {
      return res.status(403).json({
        error: 'Pro tier required',
        message: 'Product detection is a Pro feature',
        upgradeUrl: '/settings?upgrade=pro',
      });
    }

    const { imageUrl } = req.body;
    if (!imageUrl) {
      return res.status(400).json({ error: 'Image URL required' });
    }

    const products = await detectProducts(imageUrl);

    res.json({
      success: true,
      data: { products },
    });
  } catch (error) {
    console.error('Detect products error:', error);
    res.status(500).json({ error: 'Failed to detect products' });
  }
});

// Detect style in image
router.post('/detect-style', async (req: Request, res: Response) => {
  try {
    const shopId = req.headers['x-shop-id'] as string || req.body.shopId;

    if (!shopId) {
      return res.status(400).json({ error: 'Shop ID required' });
    }

    const isPro = await checkProTier(shopId);
    if (!isPro) {
      return res.status(403).json({
        error: 'Pro tier required',
        message: 'Style detection is a Pro feature',
        upgradeUrl: '/settings?upgrade=pro',
      });
    }

    const { imageUrl } = req.body;
    if (!imageUrl) {
      return res.status(400).json({ error: 'Image URL required' });
    }

    const styles = await detectStyle(imageUrl);

    res.json({
      success: true,
      data: { styles },
    });
  } catch (error) {
    console.error('Detect style error:', error);
    res.status(500).json({ error: 'Failed to detect style' });
  }
});

// Generate AI caption for image
router.post('/caption', async (req: Request, res: Response) => {
  try {
    const shopId = req.headers['x-shop-id'] as string || req.body.shopId;

    if (!shopId) {
      return res.status(400).json({ error: 'Shop ID required' });
    }

    const isPro = await checkProTier(shopId);
    if (!isPro) {
      return res.status(403).json({
        error: 'Pro tier required',
        message: 'AI captions is a Pro feature',
        upgradeUrl: '/settings?upgrade=pro',
      });
    }

    const { imageUrl } = req.body;
    if (!imageUrl) {
      return res.status(400).json({ error: 'Image URL required' });
    }

    const caption = await generateCaption(imageUrl);

    res.json({
      success: true,
      data: { caption },
    });
  } catch (error) {
    console.error('Caption generation error:', error);
    res.status(500).json({ error: 'Failed to generate caption' });
  }
});

// Analyze sentiment of image
router.post('/sentiment', async (req: Request, res: Response) => {
  try {
    const shopId = req.headers['x-shop-id'] as string || req.body.shopId;

    if (!shopId) {
      return res.status(400).json({ error: 'Shop ID required' });
    }

    const isPro = await checkProTier(shopId);
    if (!isPro) {
      return res.status(403).json({
        error: 'Pro tier required',
        message: 'Sentiment analysis is a Pro feature',
        upgradeUrl: '/settings?upgrade=pro',
      });
    }

    const { imageUrl } = req.body;
    if (!imageUrl) {
      return res.status(400).json({ error: 'Image URL required' });
    }

    const sentiment = await analyzeSentiment(imageUrl);

    res.json({
      success: true,
      data: sentiment,
    });
  } catch (error) {
    console.error('Sentiment analysis error:', error);
    res.status(500).json({ error: 'Failed to analyze sentiment' });
  }
});

// Get available tags (for filtering UI)
router.get('/tags', async (_req: Request, res: Response) => {
  try {
    // Get most common tags
    const tags = await prisma.tag.groupBy({
      by: ['name'],
      _count: { name: true },
      orderBy: { _count: { name: 'desc' } },
      take: 50,
    });

    res.json({
      success: true,
      data: tags.map((tag) => ({
        name: tag.name,
        count: tag._count.name,
      })),
    });
  } catch (error) {
    console.error('Get tags error:', error);
    res.status(500).json({ error: 'Failed to get tags' });
  }
});

export default router;