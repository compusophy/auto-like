import { NextRequest, NextResponse } from 'next/server';

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY || 'F27E25B1-9B59-494C-85CC-2189447DD04A';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fid = searchParams.get('fid');
    
    if (!fid) {
      return NextResponse.json({ error: 'FID parameter is required' }, { status: 400 });
    }
    
    // Test the API with a simple user lookup
    const url = `https://api.neynar.com/v2/farcaster/user?fid=${fid}`;
    console.log(`Testing Neynar API: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'accept': 'application/json',
        'x-api-key': NEYNAR_API_KEY
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Neynar API test failed: ${response.status} - ${errorText}`);
      return NextResponse.json({ 
        error: `API test failed: ${response.status}`,
        details: errorText
      }, { status: response.status });
    }
    
    const data = await response.json();
    
    return NextResponse.json({
      success: true,
      user: data.user,
      apiKey: NEYNAR_API_KEY.substring(0, 8) + '...'
    });
    
  } catch (error) {
    console.error('Neynar API test error:', error);
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
  }
} 