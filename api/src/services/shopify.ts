/**
 * File:        api/src/services/shopify.ts
 * Module:      External · Shopify API Client
 * Purpose:     Interact with Shopify Admin API for store data
 *
 * Exports:
 *   - getShopifyClient(shop)     — Create authenticated client for store
 *   - getProduct(id)             — Fetch product details
 *   - getCustomer(id)            — Fetch customer details
 *   - registerWebhook(topic)    — Register webhooks for store
 *
 * Depends on:
 *   - @shopify/shopify-api — Official Shopify SDK
 *
 * Side-effects:
 *   - Makes HTTP requests to Shopify API
 *
 * Key invariants:
 *   - Access token required for each store
 *   - Rate limited by Shopify's API limits
 *
 * Author:      UGC Boost Team
 * Last-updated: 2026-05-12
 */

import { Client, ApiVersion } from '@shopify/shopify-api';
import { prisma } from '../models/prisma';

export interface ShopifyConfig {
  shopDomain: string;
  accessToken: string;
}

export async function getShopifyClient(shopDomain: string) {
  const shop = await prisma.shop.findUnique({
    where: { shopifyDomain: shopDomain },
  });

  if (!shop) {
    throw new Error(`Shop not found: ${shopDomain}`);
  }

  return new Client({
    domain: shopDomain,
    accessToken: shop.accessToken,
    apiVersion: ApiVersion.January2024,
  });
}

export async function getProduct(shopDomain: string, productId: string) {
  const client = await getShopifyClient(shopDomain);

  const query = `
    query getProduct($id: ID!) {
      product(id: $id) {
        id
        title
        handle
        description
        featuredImage {
          url
          altText
        }
        images(first: 5) {
          edges {
            node {
              url
              altText
            }
          }
        }
        variants(first: 10) {
          edges {
            node {
              id
              title
              price
              sku
            }
          }
        }
      }
    }
  `;

  const response = await client.query({
    data: {
      query,
      variables: { id: `gid://shopify/Product/${productId}` },
    },
  });

  return response.body.data.product;
}

export async function getCustomer(shopDomain: string, customerId: string) {
  const client = await getShopifyClient(shopDomain);

  const query = `
    query getCustomer($id: ID!) {
      customer(id: $id) {
        id
        email
        firstName
        lastName
        phone
        orders(first: 10) {
          edges {
            node {
              id
              name
              createdAt
              totalPrice
            }
          }
        }
      }
    }
  `;

  const response = await client.query({
    data: {
      query,
      variables: { id: `gid://shopify/Customer/${customerId}` },
    },
  });

  return response.body.data.customer;
}

export async function registerWebhook(
  shopDomain: string,
  topic: string,
  webhookUrl: string
) {
  const client = await getShopifyClient(shopDomain);

  const mutation = `
    mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
      webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
        userErrors {
          field
          message
        }
        webhookSubscription {
          id
          topic
          format
          endpoint {
            ... on WebhookHttpEndpoint {
              callbackUrl
            }
          }
        }
      }
    }
  `;

  const response = await client.query({
    data: {
      query: mutation,
      variables: {
        topic,
        webhookSubscription: {
          format: 'json',
          endpoint: {
            httpMethod: 'POST',
            namespace: 'ugc-boost',
            value: webhookUrl,
          },
        },
      },
    },
  });

  return response.body.data.webhookSubscriptionCreate;
}

export async function installScriptTag(shopDomain: string, scriptUrl: string) {
  const client = await getShopifyClient(shopDomain);

  const mutation = `
    mutation scriptTagCreate($input: ScriptTagInput!) {
      scriptTagCreate(input: $input) {
        userErrors {
          field
          message
        }
        scriptTag {
          id
          src
          displayScope
        }
      }
    }
  `;

  const response = await client.query({
    data: {
      query: mutation,
      variables: {
        input: {
          src: scriptUrl,
          displayScope: 'all',
        },
      },
    },
  });

  return response.body.data.scriptTagCreate;
}

export async function removeScriptTag(shopDomain: string, scriptTagId: string) {
  const client = await getShopifyClient(shopDomain);

  const mutation = `
    mutation scriptTagDelete($id: ID!) {
      scriptTagDelete(id: $id) {
        userErrors {
          field
          message
        }
        deletedScriptTagId
      }
    }
  `;

  const response = await client.query({
    data: {
      query: mutation,
      variables: { id: scriptTagId },
    },
  });

  return response.body.data.scriptTagDelete;
}