import { NextRequest, NextResponse } from 'next/server';
import { storeCSVForDownload } from '../../lib/redis-write';

export async function POST(request: NextRequest) {
  try {
    const { csvData, filename } = await request.json();
    
    if (!csvData) {
      return NextResponse.json({ error: 'No CSV data provided' }, { status: 400 });
    }

    const downloadId = await storeCSVForDownload(csvData, filename || 'farcaster-following.csv');
    
    return NextResponse.json({
      downloadId,
      downloadUrl: `/api/download?id=${downloadId}`
    });
    
  } catch (error) {
    console.error('Generate download error:', error);
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
  }
} 