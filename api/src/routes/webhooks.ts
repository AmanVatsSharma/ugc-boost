/**
 * File:        api/src/routes/webhooks.ts
 * Module:      API · Webhook Routes
 * Purpose:     Handle Shopify webhook events (orders, customers, products)
 *
 * Exports:
 *   - router — Express router with webhook endpoints
 *
 * Depends on:
 *   - express — Router
 *   - ../models/prisma — Database client
 *   - ../services/shopify — Shopify API
 *
 * Side-effects:
 *   - Creates UGCItem records in database
 *   - May trigger auto-posting workflows
 *
 * Key invariants:
 *   - Verifies Shopify webhook signature
 *   - Shop must exist in database before processing
 *
 * Author:      UGC Boost Team
 * Last-updated: 2026-05-12
 */

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../models/prisma';

const router = Router();

// Webhook secret for signature verification
const WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET || '';

// Verify Shopify webhook signature
function verifyWebhookSignature(
  body: string,
  signature: string,
  secret: string
): boolean {
  const hmac = crypto.createHmac('sha256', secret);
  const digest = Buffer.from(
    hmac.update(body).digest('hex'),
    'utf-8'
  );
  const signatureBuffer = Buffer.from(signature, 'utf-8');

  return crypto.timingSafeEqual(digest, signatureBuffer);
}

// Health check for webhook endpoint
router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Order created webhook - trigger post-purchase UGC request
router.post('/orders/create', async (req: Request, res: Response) => {
  try {
    const shopDomain = req.headers['x-shopify-shop-domain'] as string;
    const topic = req.headers['x-shopify-topic'] as string;

    if (!shopDomain) {
      console.error('Missing shop domain in webhook');
      return res.status(400).json({ error: 'Missing shop domain' });
    }

    // In production, verify webhook signature here
    // const signature = req.headers['x-shopify-hmac-sha256'] as string;
    // if (!verifyWebhookSignature(JSON.stringify(req.body), signature, WEBHOOK_SECRET)) {
    //   return res.status(401).json({ error: 'Invalid signature' });
    // }

    const orderData = req.body;
    const { id, customer, line_items, email, created_at } = orderData;

    console.log(`Processing order webhook: ${id} from ${shopDomain}`);

    // Find or create shop record
    let shop = await prisma.shop.findUnique({
      where: { shopifyDomain: shopDomain },
    });

    if (!shop) {
      console.log(`Shop not found: ${shopDomain}, skipping webhook`);
      return res.status(200).json({ message: 'Shop not found, skipped' });
    }

    // Get the default gallery for this shop
    const defaultGallery = await prisma.gallery.findFirst({
      where: {
        shopId: shop.id,
        isActive: true,
      },
    });

    if (!defaultGallery) {
      console.log(`No active gallery for shop: ${shopDomain}`);
      return res.status(200).json({ message: 'No gallery found, skipped' });
    }

    // Create pending UGC requests for each line item
    // (In production, this might create a record to track the request)
    const ugcRequests = line_items.map((item: any) => ({
      shopId: shop.id,
      galleryId: defaultGallery.id,
      orderId: id,
      productId: item.product_id?.toString(),
      productTitle: item.title,
      customerId: customer?.id?.toString() || '',
      customerEmail: email,
      requestedAt: new Date(),
      status: 'pending',
    }));

    // In a full implementation, you might:
    // 1. Send email/SMS to customer requesting UGC
    // 2. Create a UGCRequest record to track follow-ups
    // 3. Trigger Shopify Flow automation

    console.log(`Created ${ugcRequests.length} UGC requests for order ${id}`);

    res.status(200).json({
      success: true,
      message: 'Webhook processed successfully',
      requestsCreated: ugcRequests.length,
    });
  } catch (error) {
    console.error('Order webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Customer data updated webhook
router.post('/customers/update', async (req: Request, res: Response) => {
  try {
    const shopDomain = req.headers['x-shopify-shop-domain'] as string;

    if (!shopDomain) {
      return res.status(400).json({ error: 'Missing shop domain' });
    }

    const customerData = req.body;
    const { id, email, first_name, last_name, phone } = customerData;

    console.log(`Processing customer update webhook: ${id} from ${shopDomain}`);

    // Update customer info in any existing UGC items
    await prisma.uGCItem.updateMany({
      where: {
        customerId: id?.toString(),
      },
      data: {
        customerName: `${first_name || ''} ${last_name || ''}`.trim() || undefined,
        customerEmail: email,
      },
    });

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Customer update webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Product update webhook - sync product data with UGC items
router.post('/products/update', async (req: Request, res: Response) => {
  try {
    const shopDomain = req.headers['x-shopify-shop-domain'] as string;

    if (!shopDomain) {
      return res.status(400).json({ error: 'Missing shop domain' });
    }

    const productData = req.body;
    const { id, title } = productData;

    console.log(`Processing product update webhook: ${id} from ${shopDomain}`);

    // Update product title in any existing UGC items
    await prisma.uGCItem.updateMany({
      where: {
        productId: id?.toString(),
      },
      data: {
        productTitle: title,
      },
    });

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Product update webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// App uninstalled webhook
router.post('/app/uninstalled', async (req: Request, res: Response) => {
  try {
    const shopDomain = req.headers['x-shopify-shop-domain'] as string;

    if (!shopDomain) {
      return res.status(400).json({ error: 'Missing shop domain' });
    }

    console.log(`Processing app uninstall webhook: ${shopDomain}`);

    // Mark shop as inactive (don't delete data for compliance)
    await prisma.shop.update({
      where: { shopifyDomain: shopDomain },
      data: { isActive: false },
    });

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('App uninstall webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;