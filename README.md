# Auto-Like

Ultra minimal brutalist utility for automatic Farcaster cast liking.

## Setup

```bash
npm install
npm run dev
```

## Environment

Create `.env.local`:

```env
NEYNAR_API_KEY=your_key_here
UPSTASH_REDIS_URL=your_redis_url
UPSTASH_REDIS_TOKEN=your_redis_token
NEXT_PUBLIC_URL=http://localhost:3000
```

## Deploy

```bash
vercel --prod
```

Enable cron jobs in Vercel dashboard after deployment.
