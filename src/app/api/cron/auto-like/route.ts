import { NextRequest, NextResponse } from 'next/server';

// Simple cron endpoint that calls the auto-like polling system
export async function GET(request: NextRequest) {
  try {
    console.log('🕐 Cron job triggered for auto-like polling');
    
    // Call the auto-like polling endpoint
    const baseUrl = process.env.NEXT_PUBLIC_URL || 'http://localhost:3000';
    
    const response = await fetch(`${baseUrl}/api/auto-like-poll`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      console.log('✅ Auto-like polling completed:', data);
      
      return NextResponse.json({
        success: true,
        message: 'Auto-like polling completed',
        results: data.results
      });
    } else {
      const errorText = await response.text();
      console.error('❌ Auto-like polling failed:', errorText);
      
      return NextResponse.json({
        success: false,
        error: 'Polling failed',
        details: errorText
      }, { status: 500 });
    }

  } catch (error) {
    console.error('❌ Cron job error:', error);
    return NextResponse.json({
      success: false,
      error: 'Cron job failed'
    }, { status: 500 });
  }
}

// Allow POST as well for manual triggering
export async function POST(request: NextRequest) {
  return GET(request);
}
