# UGC Boost — Customer Content Curation & Display

> Automatically find, curate, and display customer photos and videos on your store to build social proof and turn buyers into brand advocates.

[![Shopify App](https://img.shields.io/badge/Shopify-App-95BF47?style=flat-square&logo=shopify)](https://apps.shopify.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](#license)

## Overview

UGC Boost helps D2C brands (Fashion, Beauty, Lifestyle) automatically find, curate, and display customer-generated photos and videos on their store. It turns buyers into brand advocates through automated content discovery and beautiful galleries.

## Features

- **Automated Content Discovery** — Find customer photos from Instagram, TikTok, and order data
- **AI Image Tagging** — Automatically categorize and tag UGC by product, style, and sentiment
- **Beautiful Galleries** — Multiple layout options (grid, carousel, masonry) for any page
- **Moderation Dashboard** — Review and approve content before it goes live
- **Social Proof Widgets** — Display reviews, ratings, and customer photos on product pages
- **A/B Testing** — Test different gallery configurations and placements

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Remix, React, Shopify Polaris |
| Backend | Node.js, Express, Prisma |
| Database | PostgreSQL |
| Storage | Cloudflare R2 / AWS S3 |
| AI | OpenAI Vision |

## Project Structure

```
ugc-boost/
├── web/              # Remix frontend app
├── api/              # Express API server
│   ├── src/
│   │   ├── routes/   # API endpoints
│   │   ├── services/ # Business logic
│   │   └── models/   # Prisma client
│   └── prisma/
│       └── schema.prisma
└── shared/           # Shared TypeScript types
```

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database
- Cloudflare R2 or AWS S3 bucket
- Shopify Partner account

### Installation

```bash
# Clone the repository
git clone https://github.com/AmanVatsSharma/ugc-boost.git
cd ugc-boost

# Install dependencies
npm install

# Set up environment variables
cp api/.env.example api/.env

# Run database migrations
cd api && npx prisma migrate dev
```

### Development

```bash
# Start API server
cd api && npm run dev

# Start web app
cd web && npm run dev
```

## Pricing

| Tier | Price | Features |
|------|-------|----------|
| **Free** | $0/mo | 1 gallery, 50 UGC items, basic curation |
| **Pro** | $49/mo | Unlimited galleries, AI tagging, auto-posting, A/B testing |

## License

MIT License

---

Built with Shopify CLI and Claude Code.