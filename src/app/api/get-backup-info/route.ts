import { NextRequest, NextResponse } from 'next/server';
import { getBackupInfo } from '../../lib/redis-write';

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
    
    // Get backup info from Redis
    const backupInfo = await getBackupInfo(ethAddress);
    
    console.log('Backup info result:', backupInfo ? `Found ${backupInfo.count} accounts, unfollowed: ${backupInfo.unfollowed}` : 'No backup found');
    
    if (!backupInfo) {
      return NextResponse.json({ 
        exists: false,
        count: 0,
        unfollowed: false
      });
    }
    
    return NextResponse.json({
      exists: true,
      count: backupInfo.count,
      unfollowed: backupInfo.unfollowed,
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