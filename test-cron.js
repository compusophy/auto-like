#!/usr/bin/env node

/**
 * Test script for auto-like cron functionality
 * Run this locally to test the cron system before deploying
 */

const fetch = require('node-fetch');

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

async function testCron() {
  console.log('🕐 Testing auto-like cron system...\n');

  try {
    console.log('📡 Calling cron endpoint...');
    const response = await fetch(`${BASE_URL}/api/cron/auto-like`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (response.ok) {
      console.log('✅ Cron job completed successfully!');
      console.log('\n📊 Results:');
      console.log(`   - Total processed: ${data.results?.totalProcessed || 0}`);
      console.log(`   - Total liked: ${data.results?.totalLiked || 0}`);
      console.log(`   - Total skipped: ${data.results?.totalSkipped || 0}`);
      console.log(`   - Total errors: ${data.results?.totalErrors || 0}`);
      console.log(`   - Active configs found: ${data.results?.signerResults?.length || 0}`);

      if (data.results?.signerResults?.length > 0) {
        console.log('\n📋 Signer Results:');
        data.results.signerResults.forEach((result, index) => {
          console.log(`   ${index + 1}. FID ${result.signerAddress || 'unknown'}: ${result.liked || 0} liked, ${result.skipped || 0} skipped, ${result.errors || 0} errors`);
        });
      }
    } else {
      console.log('❌ Cron job failed:', data.error);
      if (data.details) {
        console.log('Details:', data.details);
      }
    }
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }

  console.log('\n💡 To test on Vercel:');
  console.log('   curl -X POST https://your-app.vercel.app/api/cron/auto-like');
}

// Run the test
testCron();
