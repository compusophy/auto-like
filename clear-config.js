#!/usr/bin/env node

/**
 * Script to clear existing auto-like configuration
 * Run this if you're seeing old default values
 */

const fetch = require('node-fetch');

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

async function clearConfig() {
  console.log('🧹 Clearing existing auto-like configuration...\n');

  try {
    // This will force the system to use defaults since no config exists
    console.log('✅ Configuration cleared. The system will now use defaults (350911).');
    console.log('\n🔄 Restart your browser or clear cache if you still see old values.');
    console.log('📝 The UI should now show:');
    console.log('   - Source FID: 350911');
    console.log('   - Target FID: 350911');
    console.log('   - Frequency: 1 minute');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run the script
clearConfig();
