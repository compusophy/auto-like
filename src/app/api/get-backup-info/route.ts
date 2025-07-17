import { NextRequest, NextResponse } from 'next/server';
import { getBackupData } from '../../lib/redis-write';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('Get backup info request body:', body);
    
    const { ethAddress } = body;
    
    if (!ethAddress) {
      console.error('Missing ethAddress in request');
      return NextResponse.json({ error: 'ETH address is required' }, { status: 400 });
    }
    
    console.log('Checking backup for address:', ethAddress);
    
    // Get backup data from Redis
    const backupData = await getBackupData(ethAddress);
    
    console.log('Backup data result:', backupData ? `Found ${backupData.length} accounts` : 'No backup found');
    
    if (!backupData) {
      return NextResponse.json({ 
        exists: false,
        count: 0
      });
    }
    
    return NextResponse.json({
      exists: true,
      count: backupData.length,
      createdAt: Date.now() // We could store this in the backup data if needed
    });
    
  } catch (error) {
    console.error('Get backup info error:', error);
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
  }
} 