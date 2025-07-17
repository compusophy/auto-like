import { NextRequest, NextResponse } from 'next/server';
import { getCSVForDownload } from '../../lib/redis-write';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const downloadId = searchParams.get('id');
    
    if (!downloadId) {
      return NextResponse.json({ error: 'No download ID provided' }, { status: 400 });
    }

    // Get CSV data from Redis
    const csvData = await getCSVForDownload(downloadId);
    
    if (!csvData) {
      return NextResponse.json({ error: 'Download not found or expired' }, { status: 404 });
    }

    // Create response with CSV data
    const response = new NextResponse(csvData.csvData, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${csvData.filename}"`,
        'Cache-Control': 'no-cache',
      },
    });

    return response;
    
  } catch (error) {
    console.error('Download error:', error);
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
  }
} 