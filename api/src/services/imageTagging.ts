/**
 * File:        api/src/services/imageTagging.ts
 * Module:      AI · Image Tagging Service
 * Purpose:     Auto-tag UGC content using OpenAI Vision
 *
 * Exports:
 *   - tagImage(imageUrl)                  — Analyze image and return tags
 *   - batchTagImages(imageUrls)           — Tag multiple images
 *   - detectProducts(imageUrl)           — Identify products in image
 *   - detectStyle(imageUrl)              — Analyze style/category tags
 *
 * Depends on:
 *   - openai — OpenAI SDK
 *
 * Side-effects:
 *   - API calls to OpenAI
 *
 * Key invariants:
 *   - Pro tier required for AI features
 *   - Rate limited to prevent API abuse
 *
 * Author:      UGC Boost Team
 * Last-updated: 2026-05-12
 */

import OpenAI from 'openai';
import { z } from 'zod';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Tag categories for fashion/beauty/lifestyle brands
const TAG_CATEGORIES = {
  product: ['dress', 'top', 'bottom', 'shoes', 'accessory', 'makeup', 'skincare', 'jewelry', 'bag'],
  style: ['casual', 'formal', 'bohemian', 'streetwear', 'minimalist', 'vintage', 'sporty', 'elegant'],
  color: ['black', 'white', 'neutral', 'pastel', 'bold', 'earth-tone', 'bright', 'dark'],
  setting: ['outdoor', 'indoor', 'studio', 'lifestyle', 'event', 'travel', 'beach', 'urban'],
  mood: ['professional', 'fun', 'relaxed', 'active', 'luxurious', 'natural', 'artistic'],
};

const TagResponseSchema = z.object({
  tags: z.array(z.string()),
  detectedProducts: z.array(z.string()),
  detectedStyle: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

export type ImageTagResult = z.infer<typeof TagResponseSchema>;

export async function tagImage(imageUrl: string): Promise<ImageTagResult> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  const prompt = `
    Analyze this image for a fashion/beauty/lifestyle brand's user-generated content.
    Return a JSON object with:
    - tags: Array of relevant tags (product type, style, color, setting, mood)
    - detectedProducts: Array of specific products visible (e.g., "red dress", "leather bag")
    - detectedStyle: Array of style descriptors (e.g., "casual", "streetwear", "minimalist")
    - confidence: A number between 0 and 1 indicating confidence in the analysis

    Categories to consider:
    - Products: ${TAG_CATEGORIES.product.join(', ')}
    - Styles: ${TAG_CATEGORIES.style.join(', ')}
    - Colors: ${TAG_CATEGORIES.color.join(', ')}
    - Settings: ${TAG_CATEGORIES.setting.join(', ')}
    - Moods: ${TAG_CATEGORIES.mood.join(', ')}

    Only include tags that are clearly visible in the image.
    Return valid JSON only, no markdown formatting.
  `;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o', // Uses vision capabilities
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt,
            },
            {
              type: 'image_url',
              image_url: {
                url: imageUrl,
                detail: 'low', // Low detail for faster processing
              },
            },
          ],
        },
      ],
      max_tokens: 500,
      temperature: 0.3, // Low temperature for consistent results
    });

    const content = response.choices[0]?.message?.content || '{}';

    // Parse and validate response
    const parsed = JSON.parse(content);
    return TagResponseSchema.parse(parsed);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Invalid tag response schema:', error.errors);
      return {
        tags: [],
        detectedProducts: [],
        detectedStyle: [],
        confidence: 0,
      };
    }

    console.error('OpenAI API error:', error);
    throw new Error('Failed to analyze image');
  }
}

export async function batchTagImages(
  imageUrls: string[],
  options: { concurrency?: number } = {}
): Promise<ImageTagResult[]> {
  const { concurrency = 3 } = options;

  // Process images in batches to avoid rate limits
  const results: ImageTagResult[] = [];
  const batches: string[][] = [];

  for (let i = 0; i < imageUrls.length; i += concurrency) {
    batches.push(imageUrls.slice(i, i + concurrency));
  }

  for (const batch of batches) {
    const batchResults = await Promise.all(batch.map((url) => tagImage(url)));
    results.push(...batchResults);

    // Add delay between batches to respect rate limits
    if (batches.length > 1) {
      await sleep;
    }
  }

  return results;
}

export async function detectProducts(imageUrl: string): Promise<string[]> {
  const result = await tagImage(imageUrl);
  return result.detectedProducts;
}

export async function detectStyle(imageUrl: string): Promise<string[]> {
  const result = await tagImage(imageUrl);
  return result.detectedStyle;
}

export async function generateCaption(imageUrl: string): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  const prompt = `
    Write a short, engaging caption for this user-generated content image for a fashion/beauty brand.
    The caption should be:
    - Under 150 characters
    - Natural and authentic (not corporate)
    - Highlight the product or style shown
    - Suitable for social media

    Return only the caption text, no quotes or additional context.
  `;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt,
            },
            {
              type: 'image_url',
              image_url: {
                url: imageUrl,
                detail: 'low',
              },
            },
          ],
        },
      ],
      max_tokens: 200,
      temperature: 0.7,
    });

    return response.choices[0]?.message?.content?.trim() || '';
  } catch (error) {
    console.error('OpenAI caption generation error:', error);
    return '';
  }
}

export async function analyzeSentiment(imageUrl: string): Promise<{
  sentiment: 'positive' | 'neutral' | 'negative';
  intensity: number;
  keyPhrases: string[];
}> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  const prompt = `
    Analyze the sentiment of this user-generated content image for a fashion/beauty brand.
    Consider:
    - The expression/pose of any people
    - The overall mood and aesthetic
    - How positive the content appears for brand marketing

    Return a JSON object with:
    - sentiment: "positive", "neutral", or "negative"
    - intensity: A number from 0 to 1 indicating how strong the sentiment is
    - keyPhrases: Array of descriptive phrases about the content

    Return valid JSON only.
  `;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt,
            },
            {
              type: 'image_url',
              image_url: {
                url: imageUrl,
                detail: 'low',
              },
            },
          ],
        },
      ],
      max_tokens: 300,
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content || '{}';
    return JSON.parse(content);
  } catch (error) {
    console.error('OpenAI sentiment analysis error:', error);
    return {
      sentiment: 'neutral',
      intensity: 0.5,
      keyPhrases: [],
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
