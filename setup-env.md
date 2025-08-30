# Environment Setup Guide

To fix the Redis configuration errors, you need to create a `.env.local` file in the root directory with the following variables:

## Required Environment Variables

Create a file called `.env.local` in the root directory with:

```bash
# Upstash Redis Configuration
# Get these from your Upstash Redis dashboard: https://console.upstash.com/
UPSTASH_REDIS_URL=your_redis_url_here
UPSTASH_REDIS_TOKEN=your_redis_token_here

# Frontend Redis (read-only token for client-side operations)
NEXT_PUBLIC_UPSTASH_REDIS_URL=your_redis_url_here
NEXT_PUBLIC_UPSTASH_REDIS_READ_TOKEN=your_readonly_token_here

# Neynar API Key (for Farcaster operations)
NEYNAR_API_KEY=your_neynar_api_key_here
```

## How to Get These Values

### 1. Upstash Redis
1. Go to [Upstash Console](https://console.upstash.com/)
2. Create a new Redis database or use an existing one
3. Copy the `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`
4. For the read-only token, create a separate token with read-only permissions

### 2. Neynar API Key
1. Go to [Neynar Console](https://neynar.com/)
2. Create an account and get your API key

## Production Deployment Environment Variables

For Vercel deployment, you also need to set these environment variables in your Vercel dashboard:

- `NEXT_PUBLIC_URL`: Your deployed Vercel URL (e.g., `https://your-app-name.vercel.app`)
- `NEYNAR_API_KEY`: Your Neynar API key
- `UPSTASH_REDIS_URL`: Your Upstash Redis URL
- `UPSTASH_REDIS_TOKEN`: Your Upstash Redis token
- `NEXT_PUBLIC_UPSTASH_REDIS_URL`: Your Upstash Redis URL (public)
- `NEXT_PUBLIC_UPSTASH_REDIS_READ_TOKEN`: Your Upstash Redis read token

## After Setup
1. Save the `.env.local` file
2. Restart your development server: `npm run dev`
3. The Redis errors should be resolved

## Troubleshooting
- Make sure the `.env.local` file is in the root directory (same level as `package.json`)
- Restart the development server after creating the file
- Check the browser console for any remaining errors 