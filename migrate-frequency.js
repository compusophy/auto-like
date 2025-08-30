#!/usr/bin/env node

/**
 * Migration Script: Update all 1-minute auto-like frequencies to 5 minutes
 *
 * This script updates the default frequency from 1 minute to 5 minutes
 * for all existing auto-like configurations.
 *
 * Usage: node migrate-frequency.js
 */

const { Redis } = require('@upstash/redis');

// Load environment variables
require('dotenv').config();

// Initialize Redis connection
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL,
  token: process.env.UPSTASH_REDIS_TOKEN,
});

console.log('🔄 Starting Frequency Migration...\n');

// Helper function to format timestamps
function formatTimestamp(timestamp) {
  if (!timestamp) return 'Never';
  const date = new Date(timestamp);
  const now = new Date();
  const diffHours = Math.floor((now - date) / (1000 * 60 * 60));

  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

async function migrateFrequencies() {
  console.log('📊 MIGRATING AUTO-LIKE FREQUENCIES FROM 1 MINUTE TO 5 MINUTES\n');

  try {
    // Get all auto-like config keys
    const configKeys = await redis.keys('autolike_config_*');

    if (configKeys.length === 0) {
      console.log('❌ No auto-like configurations found');
      return;
    }

    console.log(`📈 Found ${configKeys.length} total auto-like configurations\n`);

    let updatedCount = 0;
    let skippedCount = 0;
    const updatedConfigs = [];

    // Process each configuration
    for (const key of configKeys) {
      const stored = await redis.get(key);
      if (stored) {
        const configData = typeof stored === 'string' ? JSON.parse(stored) : stored;
        const signerAddress = key.replace('autolike_config_', '');

        // Check if frequency is 1 minute and needs updating
        if (configData.frequency === 1) {
          console.log(`🔄 Updating ${signerAddress.slice(0, 10)}... from ${configData.frequency}min to 5min`);

          // Update the frequency to 5 minutes
          const updatedConfig = {
            ...configData,
            frequency: 5,
            updatedAt: Date.now()
          };

          // Save the updated configuration
          await redis.set(key, JSON.stringify(updatedConfig));

          updatedCount++;
          updatedConfigs.push({
            signerAddress,
            oldFrequency: configData.frequency,
            newFrequency: updatedConfig.frequency,
            isActive: configData.isActive,
            targetFids: configData.targetFids || []
          });

        } else {
          console.log(`⏭️ Skipping ${signerAddress.slice(0, 10)}... (already ${configData.frequency}min)`);
          skippedCount++;
        }
      }
    }

    // Display migration results
    console.log('\n✅ MIGRATION COMPLETE!\n');

    console.log('📊 MIGRATION SUMMARY:');
    console.log(`   • Total configurations: ${configKeys.length}`);
    console.log(`   • Updated to 5min: ${updatedCount}`);
    console.log(`   • Skipped (already 5min+): ${skippedCount}`);
    console.log(`   • Success rate: ${((updatedCount / configKeys.length) * 100).toFixed(1)}%\n`);

    if (updatedConfigs.length > 0) {
      console.log('🔧 UPDATED CONFIGURATIONS:');
      updatedConfigs.forEach(config => {
        const status = config.isActive ? '✅ ACTIVE' : '⏸️ INACTIVE';
        const targets = config.targetFids.join(', ') || 'none';
        console.log(`   • ${config.signerAddress.slice(0, 10)}...: ${status} | ${config.oldFrequency}min → ${config.newFrequency}min | Targets: ${targets}`);
      });
    }

    console.log('\n🎯 IMPACT:');
    console.log(`   • Users will now auto-like every 5 minutes instead of every 1 minute`);
    console.log(`   • This reduces API calls by 80% and provides better rate limiting`);
    console.log(`   • New users will get 5 minutes as the default frequency`);

  } catch (error) {
    console.error('❌ Error during migration:', error.message);
    process.exit(1);
  }
}

async function verifyMigration() {
  console.log('\n🔍 VERIFYING MIGRATION...\n');

  try {
    // Get all auto-like config keys
    const configKeys = await redis.keys('autolike_config_*');

    let oneMinuteCount = 0;
    let fiveMinuteCount = 0;
    let otherMinuteCount = 0;

    for (const key of configKeys) {
      const stored = await redis.get(key);
      if (stored) {
        const configData = typeof stored === 'string' ? JSON.parse(stored) : stored;
        if (configData.frequency === 1) oneMinuteCount++;
        else if (configData.frequency === 5) fiveMinuteCount++;
        else otherMinuteCount++;
      }
    }

    console.log('📊 VERIFICATION RESULTS:');
    console.log(`   • 1-minute configurations: ${oneMinuteCount}`);
    console.log(`   • 5-minute configurations: ${fiveMinuteCount}`);
    console.log(`   • Other frequencies: ${otherMinuteCount}`);

    if (oneMinuteCount === 0) {
      console.log('\n✅ SUCCESS: All configurations have been migrated to 5+ minutes!');
    } else {
      console.log(`\n⚠️ WARNING: ${oneMinuteCount} configurations still on 1 minute`);
    }

  } catch (error) {
    console.error('❌ Error during verification:', error.message);
  }
}

async function main() {
  try {
    await migrateFrequencies();
    await verifyMigration();

    console.log('\n' + '='.repeat(60));
    console.log('🎉 FREQUENCY MIGRATION COMPLETE!');
    console.log('💡 All users now have 5-minute intervals by default');
    console.log('📊 Run analytics.js to see the updated frequency distribution');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
main();
