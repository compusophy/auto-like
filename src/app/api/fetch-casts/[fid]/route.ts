import { NextRequest, NextResponse } from 'next/server';

// Neynar API configuration
const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;
const NEYNAR_API_URL = 'https://api.neynar.com/v2/farcaster/feed/user/casts';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fid: string }> }
) {
  try {
    const { fid } = await params;

    if (!fid) {
      return NextResponse.json({ error: 'FID parameter is required' }, { status: 400 });
    }

    const fidNumber = parseInt(fid);
    if (isNaN(fidNumber) || fidNumber <= 0) {
      return NextResponse.json({ error: 'Invalid FID parameter' }, { status: 400 });
    }

    if (!NEYNAR_API_KEY) {
      return NextResponse.json({ error: 'NEYNAR_API_KEY not configured' }, { status: 500 });
    }

    console.log(`Fetching 5 most recent top-level casts for FID ${fidNumber}...`);

    // Fetch casts from Neynar API (only top-level casts, no replies)
    const url = `${NEYNAR_API_URL}?fid=${fidNumber}&limit=5&include_replies=false`;

    const response = await fetch(url, {
      headers: {
        'accept': 'application/json',
        'x-api-key': NEYNAR_API_KEY
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Neynar API error: ${response.status} - ${errorText}`);
      return NextResponse.json({
        error: `Failed to fetch casts: ${response.status}`,
        details: errorText
      }, { status: response.status });
    }

    const data = await response.json();

    // Extract and format casts data
    const casts = data.casts || [];

    console.log(`Successfully fetched ${casts.length} casts for FID ${fidNumber}`);

    return NextResponse.json({
      success: true,
      fid: fidNumber,
      total: casts.length,
      casts: casts.map((cast: any) => ({
        hash: cast.hash,
        text: cast.text,
        timestamp: cast.timestamp,
        author: {
          fid: cast.author?.fid,
          username: cast.author?.username,
          displayName: cast.author?.display_name
        },
        reactions: cast.reactions || {},
        replies: cast.replies || {}
      }))
    });

  } catch (error) {
    console.error('Fetch casts error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
