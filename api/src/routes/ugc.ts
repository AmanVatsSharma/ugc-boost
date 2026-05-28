/**
 * File:        api/src/routes/ugc.ts
 * Module:      API · UGC Routes
 * Purpose:     UGC submission, moderation, and feed endpoints
 *
 * Exports:
 *   - router — Express router with UGC endpoints
 *
 * Depends on:
 *   - express — Router
 *   - ../models/prisma — Database client
 *   - ../services/mediaUpload — File upload handling
 *
 * Side-effects:
 *   - Creates/updates UGCItem records
 *   - Uploads files to S3/R2
 *   - May trigger AI tagging (Pro feature)
 *
 * Key invariants:
 *   - Customer submissions require valid gallery
 *   - Moderation requires shop authentication
 *   - Pro tier check for unlimited UGC
 *
 * Author:      UGC Boost Team
 * Last-updated: 2026-05-12
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../models/prisma';
import { uploadMedia, deleteMedia } from '../services/mediaUpload';
import { tagImage } from '../services/imageTagging';

const router = Router();

// Validation schemas
const SubmitSchema = z.object({
  galleryId: z.string().min(1),
  customerId: z.string().min(1),
  customerName: z.string().optional(),
  customerEmail: z.string().email().optional(),
  productId: z.string().optional(),
  productTitle: z.string().optional(),
  caption: z.string().max(500).optional(),
});

const ModerationSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  itemIds: z.array(z.string()).min(1),
});

const UpdateGallerySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
  displayRules: z.object({
    filterByTags: z.array(z.string()).optional(),
    excludeTags: z.array(z.string()).optional(),
    minRating: z.number().min(1).max(5).optional(),
    maxItems: z.number().min(1).max(100).optional(),
    sortBy: z.enum(['recent', 'engagement', 'rating', 'random']).optional(),
    showCaption: z.boolean().optional(),
    showCustomerName: z.boolean().optional(),
    layout: z.enum(['grid', 'masonry', 'slider']).optional(),
  }).optional(),
});

// Helper: Check subscription tier
async function getSubscriptionTier(shopId: string): Promise<'free' | 'pro' | 'enterprise'> {
  const subscription = await prisma.subscription.findFirst({
    where: { shopId },
  });
  return (subscription?.tier as 'free' | 'pro' | 'enterprise') || 'free';
}

// Helper: Count UGC items for a shop
async function countUGCItems(shopId: string): Promise<number> {
  return prisma.uGCItem.count({
    where: {
      gallery: { shopId },
    },
  });
}

// Get feed of approved UGC items for a gallery (public endpoint)
router.get('/feed/:galleryId', async (req: Request, res: Response) => {
  try {
    const { galleryId } = req.params;
    const {
      page = '1',
      pageSize = '20',
      sortBy = 'recent',
      tags,
      includeVideo = 'false',
    } = req.query;

    const gallery = await prisma.gallery.findUnique({
      where: { id: galleryId },
    });

    if (!gallery) {
      return res.status(404).json({ error: 'Gallery not found' });
    }

    if (!gallery.isActive) {
      return res.status(404).json({ error: 'Gallery is not active' });
    }

    // Build query filters
    const where: any = {
      galleryId,
      status: 'approved',
    };

    if (tags) {
      const tagList = (tags as string).split(',');
      where.tags = {
        some: {
          name: { in: tagList },
        },
      };
    }

    if (includeVideo !== 'true') {
      where.mediaType = 'photo';
    }

    // Parse display rules
    const displayRules = typeof gallery.displayRules === 'string'
      ? JSON.parse(gallery.displayRules)
      : gallery.displayRules;

    // Build order by
    const orderBy: any = {};
    switch (sortBy) {
      case 'engagement':
        orderBy.engagement = 'desc';
        break;
      case 'rating':
        orderBy.rating = 'desc';
        break;
      case 'random':
        // PostgreSQL random() - not truly random but works for pagination
        orderBy.engagement = 'desc'; // Fallback
        break;
      case 'recent':
      default:
        orderBy.createdAt = 'desc';
    }

    const pageNum = parseInt(page as string, 10);
    const pageSizeNum = parseInt(pageSize as string, 10);
    const skip = (pageNum - 1) * pageSizeNum;
    const take = displayRules.maxItems
      ? Math.min(pageSizeNum, displayRules.maxItems - skip)
      : pageSizeNum;

    const [items, total] = await Promise.all([
      prisma.uGCItem.findMany({
        where,
        orderBy,
        skip,
        take: take > 0 ? take : pageSizeNum,
        include: {
          tags: true,
        },
      }),
      prisma.uGCItem.count({ where }),
    ]);

    res.json({
      success: true,
      data: items.map((item) => ({
        id: item.id,
        mediaUrl: item.mediaUrl,
        mediaThumbnailUrl: item.mediaThumbnailUrl,
        mediaType: item.mediaType,
        caption: displayRules.showCaption ? item.caption : undefined,
        customerName: displayRules.showCustomerName ? item.customerName : undefined,
        productTitle: item.productTitle,
        tags: item.tags.map((t) => t.name),
        rating: item.rating,
      })),
      pagination: {
        page: pageNum,
        pageSize: pageSizeNum,
        total,
        hasMore: skip + items.length < total,
      },
    });
  } catch (error) {
    console.error('Feed error:', error);
    res.status(500).json({ error: 'Failed to fetch feed' });
  }
});

// Submit new UGC item (customer-facing)
router.post('/submit', async (req: Request, res: Response) => {
  try {
    const validation = SubmitSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Invalid request',
        details: validation.error.errors,
      });
    }

    const {
      galleryId,
      customerId,
      customerName,
      customerEmail,
      productId,
      productTitle,
      caption,
    } = validation.data;

    // Check gallery exists and is active
    const gallery = await prisma.gallery.findUnique({
      where: { id: galleryId },
      include: { shop: true },
    });

    if (!gallery || !gallery.isActive) {
      return res.status(404).json({ error: 'Gallery not found or inactive' });
    }

    // Check tier limits
    const tier = await getSubscriptionTier(gallery.shopId);
    if (tier === 'free') {
      const count = await countUGCItems(gallery.shopId);
      if (count >= 50) {
        return res.status(403).json({
          error: 'Free tier limit reached',
          message: 'Upgrade to Pro for unlimited UGC',
          upgradeUrl: `/settings?upgrade=pro`,
        });
      }
    }

    // Handle media upload from base64 or URL
    const { mediaUrl, mediaType } = req.body;

    // Create UGC item
    const ugcItem = await prisma.uGCItem.create({
      data: {
        galleryId,
        customerId,
        customerName,
        customerEmail,
        productId,
        productTitle,
        mediaUrl,
        mediaType: mediaType || 'photo',
        caption,
        status: 'pending',
      },
    });

    // Auto-tag with AI if Pro/Enterprise (async)
    if (tier !== 'free' && mediaUrl) {
      // Fire and forget - don't wait for AI tagging
      tagImage(mediaUrl)
        .then(async (result) => {
          if (result.tags.length > 0) {
            await prisma.tag.createMany({
              data: result.tags.map((tag) => ({
                ugcItemId: ugcItem.id,
                name: tag,
              })),
              skipDuplicates: true,
            });
          }
        })
        .catch((err) => console.error('Auto-tag failed:', err));
    }

    res.status(201).json({
      success: true,
      data: {
        id: ugcItem.id,
        status: ugcItem.status,
        message: 'UGC submitted successfully',
      },
    });
  } catch (error) {
    console.error('Submit error:', error);
    res.status(500).json({ error: 'Failed to submit UGC' });
  }
});

// Get moderation queue (shop owner)
router.get('/moderate/:shopId', async (req: Request, res: Response) => {
  try {
    const { shopId } = req.params;
    const { status = 'pending', page = '1', pageSize = '20' } = req.query;

    const pageNum = parseInt(status as string, 10);
    const pageSizeNum = parseInt(pageSize as string, 10);

    const [items, total] = await Promise.all([
      prisma.uGCItem.findMany({
        where: {
          gallery: { shopId },
          status: status as string,
        },
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * pageSizeNum,
        take: pageSizeNum,
        include: {
          gallery: { select: { name: true } },
          tags: true,
        },
      }),
      prisma.uGCItem.count({
        where: {
          gallery: { shopId },
          status: status as string,
        },
      }),
    ]);

    res.json({
      success: true,
      data: items,
      pagination: {
        page: pageNum,
        pageSize: pageSizeNum,
        total,
        hasMore: pageNum * pageSizeNum < total,
      },
    });
  } catch (error) {
    console.error('Moderation queue error:', error);
    res.status(500).json({ error: 'Failed to fetch moderation queue' });
  }
});

// Moderate UGC items (approve/reject)
router.post('/moderate', async (req: Request, res: Response) => {
  try {
    const validation = ModerationSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Invalid request',
        details: validation.error.errors,
      });
    }

    const { status, itemIds } = validation.data;

    // Update all items
    const result = await prisma.uGCItem.updateMany({
      where: { id: { in: itemIds } },
      data: { status },
    });

    res.json({
      success: true,
      updated: result.count,
      status,
    });
  } catch (error) {
    console.error('Moderation error:', error);
    res.status(500).json({ error: 'Failed to moderate items' });
  }
});

// Delete UGC item
router.delete('/:itemId', async (req: Request, res: Response) => {
  try {
    const { itemId } = req.params;

    const item = await prisma.uGCItem.findUnique({
      where: { id: itemId },
    });

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Delete media from storage
    if (item.mediaUrl) {
      try {
        await deleteMedia(item.mediaUrl);
      } catch (err) {
        console.error('Failed to delete media:', err);
      }
    }

    // Delete database record (cascades to tags and analytics)
    await prisma.uGCItem.delete({
      where: { id: itemId },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

// Update UGC item (caption, tags)
router.patch('/:itemId', async (req: Request, res: Response) => {
  try {
    const { itemId } = req.params;
    const { caption, tags, rating } = req.body;

    const updateData: any = {};
    if (caption !== undefined) updateData.caption = caption;
    if (rating !== undefined) updateData.rating = rating;

    const item = await prisma.uGCItem.update({
      where: { id: itemId },
      data: updateData,
    });

    // Update tags if provided
    if (tags !== undefined) {
      // Delete existing tags
      await prisma.tag.deleteMany({
        where: { ugcItemId: itemId },
      });

      // Create new tags
      if (tags.length > 0) {
        await prisma.tag.createMany({
          data: tags.map((name: string) => ({
            ugcItemId: itemId,
            name,
          })),
        });
      }
    }

    res.json({ success: true, data: item });
  } catch (error) {
    console.error('Update error:', error);
    res.status(500).json({ error: 'Failed to update item' });
  }
});

export default router;