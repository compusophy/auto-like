import { NextRequest, NextResponse } from 'next/server';
import { getSignerByEthAddress } from '../../../lib/redis-read';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params;
    
    if (!address) {
      return NextResponse.json({ error: 'Address is required' }, { status: 400 });
    }

    const signer = await getSignerByEthAddress(address);
    
    if (!signer) {
      return NextResponse.json({ error: 'Signer not found' }, { status: 404 });
    }

    return NextResponse.json({ signer });
  } catch (error) {
    console.error('Error getting signer:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 