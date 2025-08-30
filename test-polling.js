#!/usr/bin/env node

/**
 * Test Script: Manually trigger auto-like polling for all active users
 *
 * This script tests if the polling system works correctly for all active configurations
 */

const { Redis } = require('@upstash/redis');
require('dotenv').config();

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL,
  token: process.env.UPSTASH_REDIS_TOKEN,
});

async function testPolling() {
  console.log('🧪 TESTING AUTO-LIKE POLLING SYSTEM\n');

  try {
    // Get all active configurations (simulate what the cron job does)
    const configKeys = await redis.keys('autolike_config_*');
    const activeConfigs = [];

    console.log(`📋 Found ${configKeys.length} total configurations\n`);

    for (const key of configKeys) {
      const stored = await redis.get(key);
      if (stored) {
        const configData = typeof stored === 'string' ? JSON.parse(stored) : stored;
        if (configData.isActive) {
          const signerAddress = key.replace('autolike_config_', '');
          activeConfigs.push({
            signerAddress,
            config: configData
          });
        }
      }
    }

    console.log(`🎯 Found ${activeConfigs.length} active configurations:\n`);

    // Show which users should be liking what
    for (const { signerAddress, config } of activeConfigs) {
      const targets = config.targetFids && config.targetFids.length > 0 ? config.targetFids.join(', ') : 'none';
      console.log(`   • ${signerAddress.slice(0, 10)}... (FID ${config.sourceFid}) → targets: ${targets}`);

      // Highlight if they target the user's FID (350911)
      if (config.targetFids && config.targetFids.includes(350911)) {
        console.log(`      🎯 TARGETS YOUR FID (350911)!`);
      }
      console.log('');
    }

    // Test the actual polling endpoint
    console.log('🚀 TESTING POLLING ENDPOINT...\n');

    const pollingResponse = await fetch('http://localhost:3000/api/auto-like-poll', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (pollingResponse.ok) {
      const result = await pollingResponse.json();
      console.log('✅ Polling successful!');
      console.log('📊 Results:', JSON.stringify(result, null, 2));
    } else {
      const error = await pollingResponse.text();
      console.log('❌ Polling failed:', error);
    }

  } catch (error) {
    console.error('❌ Test error:', error.message);

    if (error.message.includes('fetch')) {
      console.log('\n💡 Make sure your development server is running on http://localhost:3000');
      console.log('   Run: npm run dev');
    }
  }
}

testPolling();
