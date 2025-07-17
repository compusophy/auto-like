import { NextRequest, NextResponse } from 'next/server';
import { redisServer } from '../../lib/redis-client';

export async function POST(request: NextRequest) {
  try {
    const { signerData } = await request.json();
    
    if (!signerData || !signerData.address) {
      return NextResponse.json({ error: 'Valid signer data is required' }, { status: 400 });
    }
    
    const key = `backup_${signerData.address}`;
    
    // Delete the backup data from Redis
    if (!redisServer) {
      return NextResponse.json({ error: 'Redis not configured' }, { status: 500 });
    }
    
    const deleted = await redisServer.del(key);
    
    if (deleted === 1) {
      return NextResponse.json({ 
        success: true, 
        message: 'Backup deleted successfully' 
      });
    } else {
      return NextResponse.json({ 
        success: false, 
        message: 'Backup not found' 
      });
    }
    
  } catch (error) {
    console.error('Delete backup error:', error);
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
  }
} 