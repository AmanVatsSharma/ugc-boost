# UGC Boost - AI-Powered Social Proof Engine

## App Concept
UGC Boost automatically finds, curates, and displays customer photos and videos on store, turning buyers into brand advocates.

## Problem Solved
- Manual curation of UGC is time-consuming
- Authentic content underutilized in conversion
- Missing social proof on product pages

## Core Features

### Free Tier ($0)
- **Social Feed Widget** - Display customer photos on storefront
- **Basic Curation** - Moderate which content shows
- **1 Gallery** - One collection of content
- **50 UGC Items** - Store up to 50 photos/videos

### Pro Tier ($49/mo)
- **Auto-Tag AI** - AI auto-categorizes content by product/style
- **Multi-Gallery** - Multiple galleries for different themes
- **Infinite UGC** - Unlimited content storage
- **Auto-Posting** - Auto-publish to social media
- **A/B Testing** - Test which UGC converts better
- **Influencer ID** - Identify high-engagement customers
- **Rating Photos** - Prioritize 5-star reviews with photos
- **Shopify Flow Integration** - Trigger automations based on UGC

## Tech Stack
- **Frontend**: Remix + React + Shopify Polaris
- **Backend**: Node.js + Express
- **Database**: PostgreSQL (via Prisma)
- **Storage**: Cloudflare R2 / AWS S3 for media
- **AI**: OpenAI Vision + CLIP for image tagging
- **CDN**: Cloudflare for global delivery
- **Hosting**: Fly.io / Railway

## API Design

### Endpoints
```
POST /api/webhooks/orders/create     - Trigger after purchase
POST /api/ugc/submit                 - Customer submit photo
GET  /api/ugc/feed                   - Get curated feed
POST /api/ai/tag                     - Auto-tag content
GET  /api/analytics/engagement        - UGC performance
POST /api/shopify/widget             - Render widget embed
```

## Data Models

### UGCItem
- id: string
- customerId: string
- productId: string (optional)
- mediaUrl: string
- mediaType: 'photo' | 'video'
- tags: string[]
- status: 'pending' | 'approved' | 'rejected'
- engagement: number
- createdAt: Date

### Gallery
- id: string
- shopId: string
- name: string
- description: string
- isActive: boolean
- displayRules: JSON

## File Structure
```
ugc-boost/
├── web/
│   ├── app/
│   │   ├── routes/
│   │   │   ├── _index.tsx              # Dashboard home
│   │   │   ├── galleries.tsx          # Manage galleries
│   │   │   ├── submissions.tsx        # Moderate submissions
│   │   │   ├── analytics.tsx          # UGC performance
│   │   │   └── settings.tsx           # Widget settings
│   │   ├── components/
│   │   │   ├── GalleryCard.tsx
│   │   │   ├── UGCGrid.tsx
│   │   │   ├── ModerationQueue.tsx
│   │   │   ├── WidgetPreview.tsx
│   │   │   └── ProGate.tsx
│   │   └── root.tsx
│   └── package.json
├── api/
│   ├── src/
│   │   ├── index.ts
│   │   ├── routes/
│   │   │   ├── webhooks.ts
│   │   │   ├── ugc.ts
│   │   │   ├── ai.ts
│   │   │   └── analytics.ts
│   │   ├── services/
│   │   │   ├── mediaUpload.ts
│   │   │   ├── imageTagging.ts
│   │   │   └── shopify.ts
│   │   └── models/
│   │       └── prisma.ts
│   └── package.json
└── shared/
    └── package.json
```

## Widget Implementation
- Embeddable JavaScript snippet for merchants
- Customizable appearance via dashboard
- Lazy-loaded images for performance
- GDPR-compliant consent handling

## Revenue Model
- **Free**: 1 gallery, 50 items, basic display
- **Pro**: Unlimited galleries, AI tagging, auto-posting, $49/month
- **Enterprise**: White-label, API access, custom integrations
