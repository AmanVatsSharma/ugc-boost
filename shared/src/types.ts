/**
 * File:        shared/src/types.ts
 * Module:      Shared Types
 * Purpose:     Type definitions shared between web and api packages
 *
 * Exports:
 *   - UGCItem            — Customer-submitted photo/video content
 *   - Gallery            — Collection of UGC items for display
 *   - UGCStatus          — Moderation status enum
 *   - MediaType          — Photo or video enum
 *   - DisplayRule        — Gallery filtering/display configuration
 *   - Analytics          — Engagement metrics
 *   - ApiResponse<T>     — Standard API response wrapper
 *   - SubscriptionTier   — Free/Pro/Enterprise tiers
 *
 * Depends on:
 *   - none (pure types)
 *
 * Side-effects: none
 *
 * Key invariants:
 *   - UGCItem.id is unique across the entire system
 *   - Gallery.shopId links to a single Shopify store
 *   - Pro features are gated by subscription tier checks
 *
 * Read order:
 *   1. UGCItem / Gallery — core data models
 *   2. ApiResponse — API contract
 *   3. SubscriptionTier — feature gating
 *
 * Author:      UGC Boost Team
 * Last-updated: 2026-05-12
 */

export type UGCStatus = 'pending' | 'approved' | 'rejected';
export type MediaType = 'photo' | 'video';
export type SubscriptionTier = 'free' | 'pro' | 'enterprise';

export interface UGCItem {
  id: string;
  customerId: string;
  customerName?: string;
  customerEmail?: string;
  productId?: string;
  productTitle?: string;
  galleryId: string;
  mediaUrl: string;
  mediaThumbnailUrl?: string;
  mediaType: MediaType;
  caption?: string;
  tags: string[];
  status: UGCStatus;
  engagement: number;
  rating?: number;
  isInfluencer: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Gallery {
  id: string;
  shopId: string;
  name: string;
  description?: string;
  coverImageUrl?: string;
  isActive: boolean;
  displayRules: DisplayRule;
  itemCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface DisplayRule {
  filterByTags?: string[];
  excludeTags?: string[];
  minRating?: number;
  maxItems?: number;
  sortBy: 'recent' | 'engagement' | 'rating' | 'random';
  showCaption: boolean;
  showCustomerName: boolean;
  layout: 'grid' | 'masonry' | 'slider';
}

export interface Analytics {
  totalViews: number;
  totalEngagements: number;
  clickThroughRate: number;
  conversionRate: number;
  topProducts: string[];
  topTags: string[];
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    hasMore: boolean;
  };
}

export interface UGCSubmission {
  customerId: string;
  productId?: string;
  galleryId: string;
  mediaUrl: string;
  mediaType: MediaType;
  caption?: string;
}

export interface WidgetConfig {
  galleryId: string;
  layout: 'grid' | 'masonry' | 'slider';
  columns: number;
  showCaption: boolean;
  showCustomerName: boolean;
  autoPlay: boolean;
  theme: 'light' | 'dark';
  borderRadius: number;
}

export interface ABTEST {
  id: string;
  galleryId: string;
  variantA: WidgetConfig;
  variantB: WidgetConfig;
  splitPercentage: number;
  startDate: Date;
  endDate?: Date;
  results?: {
    variantAConversions: number;
    variantBConversions: number;
  };
}