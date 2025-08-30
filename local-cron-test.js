#!/usr/bin/env node

/**
 * Local Cron Job Simulator
 * Simulates Vercel cron jobs running locally
 */

const fetch = require('node-fetch');

const BASE_URL = process.env.NEXT_PUBLIC_URL || 'http://localhost:3000';

// Simulate different cron schedules
const schedules = [
  { name: '5-minute cron', interval: 5 * 60 * 1000 }, // 5 minutes
];

async function runCronJob() {
  console.log(`\n🕐 ${new Date().toLocaleTimeString()} - Running cron job...`);

  try {
    const response = await fetch(`${BASE_URL}/api/cron/auto-like`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (response.ok) {
      console.log('✅ Cron job completed successfully!');
      console.log(`📊 Results: ${data.results?.totalLiked || 0} liked, ${data.results?.totalSkipped || 0} skipped, ${data.results?.totalErrors || 0} errors`);
    } else {
      console.log('❌ Cron job failed:', data.error);
    }
  } catch (error) {
    console.error('❌ Cron job error:', error.message);
  }
}

async function simulateCronJobs() {
  console.log('🚀 Local Cron Job Simulator Started');
  console.log('📝 This simulates what Vercel cron jobs will do');
  console.log('⏰ Press Ctrl+C to stop\n');

  // Run initial test
  await runCronJob();

  // Set up intervals for different cron schedules
  schedules.forEach(schedule => {
    setInterval(async () => {
      console.log(`\n🔄 ${schedule.name} triggered`);
      await runCronJob();
    }, schedule.interval);
  });

  console.log('✅ Cron simulator started!');
  console.log('📋 Active schedule:');
  schedules.forEach(schedule => {
    console.log(`   - ${schedule.name}: every ${schedule.interval / 1000 / 60} minutes`);
  });
  console.log('\n💡 When you deploy to Vercel, this will run automatically');
  console.log('🔗 Deploy with: vercel --prod');
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Cron simulator stopped');
  process.exit(0);
});

// Run the simulation
simulateCronJobs();
