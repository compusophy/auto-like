// Redis client configuration
import { Redis } from '@upstash/redis';

// Check if Redis environment variables are configured
const hasRedisConfig = process.env.UPSTASH_REDIS_URL && process.env.UPSTASH_REDIS_TOKEN;
const hasPublicRedisConfig = process.env.NEXT_PUBLIC_UPSTASH_REDIS_URL && process.env.NEXT_PUBLIC_UPSTASH_REDIS_READ_TOKEN;

// Frontend Redis client - READ-ONLY token from environment
export const redisReadOnly = hasPublicRedisConfig ? new Redis({
  url: process.env.NEXT_PUBLIC_UPSTASH_REDIS_URL!,
  token: process.env.NEXT_PUBLIC_UPSTASH_REDIS_READ_TOKEN!,
}) : null;

// Backend Redis client - FULL token from environment (secure, server-only)
export const redisServer = hasRedisConfig ? new Redis({
  url: process.env.UPSTASH_REDIS_URL!,
  token: process.env.UPSTASH_REDIS_TOKEN!,
}) : null;

// Helper function to check if Redis is available
export const isRedisAvailable = () => {
  return hasRedisConfig && hasPublicRedisConfig;
}; 