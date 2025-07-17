// Redis client configuration
import { Redis } from '@upstash/redis';

// Frontend Redis client - READ-ONLY token from environment
export const redisReadOnly = new Redis({
  url: process.env.NEXT_PUBLIC_UPSTASH_REDIS_URL || '',
  token: process.env.NEXT_PUBLIC_UPSTASH_REDIS_READ_TOKEN || '',
});

// Backend Redis client - FULL token from environment (secure, server-only)
export const redisServer = new Redis({
  url: process.env.UPSTASH_REDIS_URL || '',
  token: process.env.UPSTASH_REDIS_TOKEN || '',
}); 