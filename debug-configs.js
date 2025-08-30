#!/usr/bin/env node

/**
 * Debug Script: Inspect auto-like configurations in Redis
 *
 * This script shows the raw structure of all auto-like configs
 * to identify why other users' cron jobs aren't working
 */

const { Redis } = require('@upstash/redis');
require('dotenv').config();

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL,
  token: process.env.UPSTASH_REDIS_TOKEN,
});

async function debugConfigs() {
  console.log('🔍 DEBUGGING AUTO-LIKE CONFIGURATIONS\n');

  try {
    // Get all auto-like config keys
    const configKeys = await redis.keys('autolike_config_*');

    console.log(`Found ${configKeys.length} configuration keys:\n`);

    for (const key of configKeys) {
      const stored = await redis.get(key);
      if (stored) {
        const configData = typeof stored === 'string' ? JSON.parse(stored) : stored;
        const signerAddress = key.replace('autolike_config_', '');

        console.log(`📋 ${signerAddress.slice(0, 10)}...:`);
        console.log(`   Raw data:`, JSON.stringify(configData, null, 2));
        console.log(`   isActive: ${configData.isActive}`);
        console.log(`   targetFids: ${configData.targetFids || 'MISSING!'}`);
        console.log(`   frequency: ${configData.frequency}`);
        console.log(`   sourceFid: ${configData.sourceFid}`);
        console.log(`   lastCheck: ${configData.lastCheck ? new Date(configData.lastCheck).toISOString() : 'Never'}\n`);
      }
    }

    // Also check what getAllActiveAutoLikeConfigs returns
    console.log('🔄 TESTING getAllActiveAutoLikeConfigs LOGIC:\n');

    const activeConfigs = [];
    for (const key of configKeys) {
      const stored = await redis.get(key);
      if (stored) {
        const configData = typeof stored === 'string' ? JSON.parse(stored) : stored;
        const signerAddress = key.replace('autolike_config_', '');

        console.log(`Checking ${signerAddress.slice(0, 10)}...: isActive = ${configData.isActive}`);

        if (configData.isActive) {
          activeConfigs.push({
            signerAddress,
            config: configData
          });
          console.log(`   ✅ INCLUDED in active configs`);
        } else {
          console.log(`   ❌ SKIPPED (inactive)`);
        }
      }
    }

    console.log(`\n🎯 FINAL RESULT: ${activeConfigs.length} active configurations found`);

  } catch (error) {
    console.error('❌ Debug error:', error.message);
  }
}

debugConfigs();
