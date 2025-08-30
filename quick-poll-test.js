#!/usr/bin/env node

/**
 * Quick Poll Test: Test the polling endpoint directly
 */

async function testPollEndpoint() {
  console.log('🧪 TESTING POLLING ENDPOINT DIRECTLY\n');

  try {
    const response = await fetch('http://localhost:3000/api/auto-like-poll', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const result = await response.json();

    console.log('📊 POLLING RESULT:');
    console.log(JSON.stringify(result, null, 2));

    if (result.signerResults) {
      console.log('\n🎯 INDIVIDUAL USER RESULTS:');
      result.signerResults.forEach((userResult, index) => {
        console.log(`\n${index + 1}. ${userResult.signerAddress?.slice(0, 10)}...`);
        console.log(`   Processed: ${userResult.processed}, Liked: ${userResult.liked}, Errors: ${userResult.errors}`);

        // Check if this user targets FID 350911
        const configKeys = Object.keys(userResult);
        console.log(`   Available data: ${configKeys.join(', ')}`);
      });
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testPollEndpoint();
