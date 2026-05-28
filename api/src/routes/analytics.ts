/**
 * File:        api/src/routes/analytics.ts
 * Module:      API · Analytics Routes
 * Purpose:     Track and retrieve UGC engagement analytics
 *
 * Exports:
 *   - router — Express router with analytics endpoints
 *
 * Depends on:
 *   - express — Router
 *   - ../models/prisma — Database client
 *
 * Side-effects:
 *   - Creates/updates analytics records
 *   - Aggregates engagement data
 *
 * Key invariants:
 *   - Analytics are tracked per UGC item per day
 *   - Views/engagements are increment-only
 *
 * Author:      UGC Boost Team
 * Last-updated: 2026-05-12
 */

import { Router, Request, Response } from 'express';
import { prisma } from '../models/prisma';

const router = Router();

// Validation schemas
const TrackEventSchema = {
  type: 'object',
  properties: {
    ugcItemId: { type: 'string' },
    eventType: { type: 'string', enum: ['view', 'click', 'share', 'conversion'] },
    shopId: { type: 'string' },
    metadata: { type: 'object' },
  },
  required: ['ugcItemId', 'eventType', 'shopId'],
};

// Track engagement event (for widget)
router.post('/track', async (req: Request, res: Response) => {
  try {
    const { ugcItemId, eventType, shopId, metadata } = req.body;

    if (!ugcItemId || !eventType || !shopId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find or create today's analytics record
    const existing = await prisma.analytics.findUnique({
      where: {
        ugcItemId_date: {
          ugcItemId,
          date: today,
        },
      },
    });

    const updateData: any = {};
    switch (eventType) {
      case 'view':
        updateData.viewCount = { increment: 1 };
        break;
      case 'click':
        updateData.clickCount = { increment: 1 };
        break;
      case 'share':
        updateData.shareCount = { increment: 1 };
        break;
      case 'conversion':
        updateData.conversionCount = { increment: 1 };
        break;
      default:
        return res.status(400).json({ error: 'Invalid event type' });
    }

    if (existing) {
      await prisma.analytics.update({
        where: { id: existing.id },
        data: updateData,
      });
    } else {
      await prisma.analytics.create({
        data: {
          ugcItemId,
          date: today,
          ...updateData,
        },
      });
    }

    // Also update the UGC item's total engagement
    await prisma.uGCItem.update({
      where: { id: ugcItemId },
      data: {
        engagement: { increment: 1 },
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Track error:', error);
    res.status(500).json({ error: 'Failed to track event' });
  }
});

// Get engagement analytics for a shop
router.get('/engagement/:shopId', async (req: Request, res: Response) => {
  try {
    const { shopId } = req.params;
    const {
      startDate,
      endDate,
      period = '7d',
      galleryId,
    } = req.query;

    // Calculate date range
    const now = new Date();
    let start: Date;
    let end = now;

    switch (period) {
      case '24h':
        start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case 'custom':
        start = startDate ? new Date(startDate as string) : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        end = endDate ? new Date(endDate as string) : now;
        break;
      default:
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    // Build where clause
    const whereClause: any = {
      ugcItem: {
        gallery: { shopId },
      },
      date: {
        gte: start,
        lte: end,
      },
    };

    if (galleryId) {
      whereClause.ugcItem.galleryId = galleryId;
    }

    // Aggregate analytics
    const analytics = await prisma.analytics.groupBy({
      by: ['date'],
      where: whereClause,
      _sum: {
        viewCount: true,
        clickCount: true,
        shareCount: true,
        conversionCount: true,
      },
      orderBy: { date: 'asc' },
    });

    // Calculate totals
    const totals = analytics.reduce(
      (acc, day) => ({
        views: acc.views + (day._sum.viewCount || 0),
        clicks: acc.clicks + (day._sum.clickCount || 0),
        shares: acc.shares + (day._sum.shareCount || 0),
        conversions: acc.conversions + (day._sum.conversionCount || 0),
      }),
      { views: 0, clicks: 0, shares: 0, conversions: 0 }
    );

    // Calculate rates
    const clickThroughRate = totals.views > 0 ? (totals.clicks / totals.views) * 100 : 0;
    const conversionRate = totals.clicks > 0 ? (totals.conversions / totals.clicks) * 100 : 0;

    res.json({
      success: true,
      data: {
        period: {
          start: start.toISOString(),
          end: end.toISOString(),
        },
        totals,
        rates: {
          clickThroughRate: Math.round(clickThroughRate * 100) / 100,
          conversionRate: Math.round(conversionRate * 100) / 100,
        },
        daily: analytics.map((day) => ({
          date: day.date.toISOString(),
          views: day._sum.viewCount || 0,
          clicks: day._sum.clickCount || 0,
          shares: day._sum.shareCount || 0,
          conversions: day._sum.conversionCount || 0,
        })),
      },
    });
  } catch (error) {
    console.error('Engagement analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// Get top performing UGC items
router.get('/top/:shopId', async (req: Request, res: Response) => {
  try {
    const { shopId } = req.params;
    const { limit = '10', period = '30d', metric = 'engagement' } = req.query;

    const limitNum = Math.min(parseInt(limit as string, 10), 50);

    // Calculate date range
    const now = new Date();
    let days = 30;
    switch (period) {
      case '7d':
        days = 7;
        break;
      case '30d':
        days = 30;
        break;
      case '90d':
        days = 90;
        break;
      case 'all':
        days = 365 * 10; // Essentially all time
        break;
    }
    const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    // Get top UGC items based on metric
    let orderBy: any;
    switch (metric) {
      case 'views':
        orderBy = { analytics: { _sum: { viewCount: 'desc' } } };
        break;
      case 'clicks':
        orderBy = { analytics: { _sum: { clickCount: 'desc' } } };
        break;
      case 'conversions':
        orderBy = { analytics: { _sum: { conversionCount: 'desc' } } };
        break;
      case 'engagement':
      default:
        orderBy = { engagement: 'desc' };
    }

    const topItems = await prisma.uGCItem.findMany({
      where: {
        gallery: { shopId },
        status: 'approved',
      },
      orderBy,
      take: limitNum,
      include: {
        gallery: { select: { name: true } },
        tags: true,
        _count: {
          select: { analytics: true },
        },
      },
    });

    // Get engagement data for the period
    const ugcItemIds = topItems.map((item) => item.id);
    const engagementData = await prisma.analytics.groupBy({
      by: ['ugcItemId'],
      where: {
        ugcItemId: { in: ugcItemIds },
        date: { gte: start },
      },
      _sum: {
        viewCount: true,
        clickCount: true,
        conversionCount: true,
      },
    });

    const engagementMap = new Map(
      engagementData.map((e) => [e.ugcItemId, e._sum])
    );

    res.json({
      success: true,
      data: topItems.map((item) => ({
        id: item.id,
        mediaUrl: item.mediaUrl,
        mediaType: item.mediaType,
        caption: item.caption,
        customerName: item.customerName,
        engagement: item.engagement,
        periodStats: engagementMap.get(item.id) || {
          viewCount: 0,
          clickCount: 0,
          conversionCount: 0,
        },
        gallery: item.gallery.name,
        tags: item.tags.map((t) => t.name),
      })),
    });
  } catch (error) {
    console.error('Top items error:', error);
    res.status(500).json({ error: 'Failed to fetch top items' });
  }
});

// Get UGC item analytics
router.get('/item/:ugcItemId', async (req: Request, res: Response) => {
  try {
    const { ugcItemId } = req.params;

    const item = await prisma.uGCItem.findUnique({
      where: { id: ugcItemId },
      include: {
        gallery: { select: { name: true, shopId: true } },
        tags: true,
        analytics: {
          orderBy: { date: 'desc' },
          take: 30,
        },
      },
    });

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Calculate totals from analytics
    const totals = item.analytics.reduce(
      (acc, day) => ({
        views: acc.views + day.viewCount,
        clicks: acc.clicks + day.clickCount,
        shares: acc.shares + day.shareCount,
        conversions: acc.conversions + day.conversionCount,
      }),
      { views: 0, clicks: 0, shares: 0, conversions: 0 }
    );

    res.json({
      success: true,
      data: {
        item: {
          id: item.id,
          mediaUrl: item.mediaUrl,
          mediaType: item.mediaType,
          caption: item.caption,
          customerName: item.customerName,
          status: item.status,
          createdAt: item.createdAt,
        },
        gallery: item.gallery.name,
        tags: item.tags.map((t) => t.name),
        totals,
        daily: item.analytics.map((day) => ({
          date: day.date,
          views: day.viewCount,
          clicks: day.clickCount,
          shares: day.shareCount,
          conversions: day.conversionCount,
        })),
      },
    });
  } catch (error) {
    console.error('Item analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch item analytics' });
  }
});

// Get influencer customers (high engagement)
router.get('/influencers/:shopId', async (req: Request, res: Response) => {
  try {
    const { shopId } = req.params;
    const { minEngagement = '100', limit = '20' } = req.query;

    const minEngagementNum = parseInt(minEngagement as string, 10);
    const limitNum = Math.min(parseInt(limit as string, 10), 50);

    // Find customers with high engagement across their UGC items
    const influencers = await prisma.uGCItem.groupBy({
      by: ['customerId', 'customerName'],
      where: {
        gallery: { shopId },
        status: 'approved',
        engagement: { gte: minEngagementNum },
      },
      _sum: {
        engagement: true,
      },
      _count: {
        id: true,
      },
      having: {
        engagement: { _sum: { gte: minEngagementNum } },
      },
      orderBy: {
        _sum: {
          engagement: 'desc',
        },
      },
      take: limitNum,
    });

    res.json({
      success: true,
      data: influencers.map((inf) => ({
        customerId: inf.customerId,
        customerName: inf.customerName,
        totalEngagement: inf._sum.engagement || 0,
        itemCount: inf._count.id,
      })),
    });
  } catch (error) {
    console.error('Influencers error:', error);
    res.status(500).json({ error: 'Failed to fetch influencers' });
  }
});

export default router;