# UGC Boost - Claude Code Project Rules

## Project Overview
UGC Boost is a Shopify app that helps D2C brands (Fashion, Beauty, Lifestyle) automatically find, curate, and display customer photos and videos on their store, turning buyers into brand advocates.

## Tech Stack
- **Frontend**: Remix + React + Shopify Polaris
- **Backend**: Node.js + Express + Prisma + PostgreSQL
- **Storage**: Cloudflare R2 / AWS S3
- **AI**: OpenAI Vision for image tagging
- **Hosting**: Fly.io / Railway

## Architecture
```
ugc-boost/
├── web/         # Remix frontend app
├── api/         # Express API server
└── shared/      # Shared TypeScript types
```

## Free vs Pro Tier
- **Free ($0)**: 1 gallery, 50 UGC items, basic curation
- **Pro ($49/mo)**: Unlimited galleries, AI tagging, auto-posting, A/B testing

## Key Commands
```bash
# Install all workspaces
npm install

# Start development
cd api && npm run dev
cd web && npm run dev
```

## File Naming Conventions
- Routes use kebab-case: `submissions.tsx`, `analytics.tsx`
- Components use PascalCase: `GalleryCard.tsx`, `UGCGrid.tsx`
- Services use camelCase: `mediaUpload.ts`, `imageTagging.ts`

## Shopify Integration
- Uses Shopify CLI for app scaffolding
- Webhooks for order completion triggers
- Polaris components for admin UI