/**
 * File:        api/src/services/mediaUpload.ts
 * Module:      External · Media Upload Service
 * Purpose:     Handle media uploads to Cloudflare R2 or AWS S3
 *
 * Exports:
 *   - uploadMedia(file, shopId)     — Upload file to cloud storage
 *   - deleteMedia(url)              — Remove file from storage
 *   - getPublicUrl(key)             — Generate CDN URL for file
 *   - generateThumbnail(videoUrl)   — Generate video thumbnail (Pro)
 *
 * Depends on:
 *   - @aws-sdk/client-s3 — S3 client (or R2 compatible)
 *   - multer — File upload handling
 *
 * Side-effects:
 *   - Writes to S3/R2 bucket
 *   - May trigger thumbnail generation job
 *
 * Key invariants:
 *   - Only images under 10MB, videos under 100MB
 *   - Files stored with shop-prefixed paths for isolation
 *
 * Author:      UGC Boost Team
 * Last-updated: 2026-05-12
 */

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';

// R2/S3 configuration
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'auto',
  endpoint: process.env.R2_ENDPOINT || process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME || process.env.S3_BUCKET_NAME || '';
const CDN_URL = process.env.CDN_URL || '';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB

export interface UploadResult {
  key: string;
  url: string;
  thumbnailUrl?: string;
  mediaType: 'photo' | 'video';
  size: number;
}

export interface UploadOptions {
  shopId: string;
  galleryId?: string;
  generateThumbnail?: boolean;
}

export async function uploadMedia(
  file: Express.Multer.File,
  options: UploadOptions
): Promise<UploadResult> {
  const { shopId, galleryId, generateThumbnail } = options;

  // Validate file type
  const isImage = ALLOWED_IMAGE_TYPES.includes(file.mimetype);
  const isVideo = ALLOWED_VIDEO_TYPES.includes(file.mimetype);

  if (!isImage && !isVideo) {
    throw new Error(`Invalid file type: ${file.mimetype}. Allowed: images and videos only.`);
  }

  // Validate file size
  if (isImage && file.size > MAX_IMAGE_SIZE) {
    throw new Error(`Image too large: ${file.size} bytes. Max: ${MAX_IMAGE_SIZE} bytes.`);
  }
  if (isVideo && file.size > MAX_VIDEO_SIZE) {
    throw new Error(`Video too large: ${file.size} bytes. Max: ${MAX_VIDEO_SIZE} bytes.`);
  }

  // Generate unique key with path structure
  const fileExtension = file.originalname.split('.').pop() || 'bin';
  const mediaType = isImage ? 'photo' : 'video';
  const timestamp = Date.now();
  const uniqueId = uuidv4().slice(0, 8);
  const key = `${shopId}/${mediaType}s/${timestamp}-${uniqueId}.${fileExtension}`;

  // Upload to R2/S3
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype,
    Metadata: {
      shopId,
      galleryId: galleryId || '',
      originalName: file.originalname,
    },
    // Set cache headers for CDN
    CacheControl: 'public, max-age=31536000, immutable',
  });

  await s3Client.send(command);

  // Generate public URL
  const url = CDN_URL ? `${CDN_URL}/${key}` : `https://${BUCKET_NAME}.s3.amazonaws.com/${key}`;

  // For videos, generate thumbnail if requested (Pro feature)
  let thumbnailUrl: string | undefined;
  if (isVideo && generateThumbnail) {
    thumbnailUrl = await generateVideoThumbnail(key);
  }

  return {
    key,
    url,
    thumbnailUrl,
    mediaType,
    size: file.size,
  };
}

export async function deleteMedia(url: string): Promise<void> {
  // Extract key from URL
  const key = extractKeyFromUrl(url);

  if (!key) {
    throw new Error('Invalid media URL');
  }

  const command = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  await s3Client.send(command);
}

export function getPublicUrl(key: string): string {
  if (CDN_URL) {
    return `${CDN_URL}/${key}`;
  }
  return `https://${BUCKET_NAME}.s3.amazonaws.com/${key}`;
}

export async function getPresignedUploadUrl(
  shopId: string,
  filename: string,
  contentType: string
): Promise<{ uploadUrl: string; key: string; expiresAt: Date }> {
  // Validate content type
  const isImage = ALLOWED_IMAGE_TYPES.includes(contentType);
  const isVideo = ALLOWED_VIDEO_TYPES.includes(contentType);

  if (!isImage && !isVideo) {
    throw new Error(`Invalid content type: ${contentType}`);
  }

  const mediaType = isImage ? 'photo' : 'video';
  const timestamp = Date.now();
  const uniqueId = uuidv4().slice(0, 8);
  const extension = filename.split('.').pop() || 'bin';
  const key = `${shopId}/${mediaType}s/${timestamp}-${uniqueId}.${extension}`;

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: contentType,
    Metadata: { shopId },
  });

  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

  return {
    uploadUrl,
    key,
    expiresAt: new Date(Date.now() + 3600 * 1000),
  };
}

async function generateVideoThumbnail(videoKey: string): Promise<string> {
  // In production, this would trigger a video processing job
  // (e.g., using AWS MediaConvert or a similar service)
  // For now, return a placeholder based on the video key

  const thumbnailKey = videoKey.replace(/\.[^.]+$/, '-thumb.jpg');
  const thumbnailUrl = CDN_URL
    ? `${CDN_URL}/${thumbnailKey}`
    : `https://${BUCKET_NAME}.s3.amazonaws.com/${thumbnailKey}`;

  return thumbnailUrl;
}

function extractKeyFromUrl(url: string): string | null {
  try {
    // Handle CDN URLs
    if (CDN_URL && url.startsWith(CDN_URL)) {
      return url.replace(`${CDN_URL}/`, '');
    }

    // Handle S3 URLs
    const urlObj = new URL(url);
    if (urlObj.hostname.includes('s3')) {
      return urlObj.pathname.slice(1);
    }

    // Handle R2/custom endpoints
    return urlObj.pathname.slice(1);
  } catch {
    return null;
  }
}

export async function getMediaMetadata(key: string): Promise<{
  size: number;
  lastModified: Date;
  contentType: string;
} | null> {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    const response = await s3Client.send(command);

    return {
      size: response.ContentLength || 0,
      lastModified: response.LastModified || new Date(),
      contentType: response.ContentType || 'application/octet-stream',
    };
  } catch {
    return null;
  }
}