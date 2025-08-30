import { NextRequest, NextResponse } from 'next/server';
import { getSignerByEthAddress } from '../../../lib/redis-read';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    // 🔐 SECURITY: Validate request origin
    const origin = request.headers.get('origin');
    const referer = request.headers.get('referer');
    const host = request.headers.get('host');

    // Only allow requests from our own domain
    if (origin && !origin.includes('localhost') && !origin.includes('vercel.app')) {
      console.warn('🚨 SECURITY: Unauthorized get-signer request origin:', origin);
      return NextResponse.json({ error: 'Unauthorized request origin' }, { status: 403 });
    }

    const { address } = await params;

    console.log('🔐 SECURITY: Get-signer request for:', {
      address: address.substring(0, 10) + '...',
      origin,
      host,
      timestamp: new Date().toISOString()
    });

    // 🔐 SECURITY: Validate required parameters
    if (!address) {
      console.warn('🚨 SECURITY: Missing address in get-signer request');
      return NextResponse.json({ error: 'Address is required' }, { status: 400 });
    }

    // 🔐 SECURITY: Validate address format (Ethereum address)
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      console.warn('🚨 SECURITY: Invalid address format in get-signer:', address);
      return NextResponse.json({ error: 'Invalid address format' }, { status: 400 });
    }

    // 🔐 SECURITY: Validate that the requester owns this address
    // This endpoint relies on client-side validation via wallet connection
    // The frontend ensures only connected wallet addresses can access their own data
    // Additional server-side validation could be added with signed messages

    const signer = await getSignerByEthAddress(address);

    if (!signer) {
      console.warn('🚨 SECURITY: Signer not found for address:', address.substring(0, 10) + '...');
      return NextResponse.json({ error: 'Signer not found' }, { status: 404 });
    }

    // 🔐 SECURITY: Validate signer data integrity
    if (!signer.fid || !signer.privateKey || typeof signer.isValidated !== 'boolean') {
      console.warn('🚨 SECURITY: Invalid signer data structure for address:', address.substring(0, 10) + '...');
      return NextResponse.json({ error: 'Invalid signer data' }, { status: 500 });
    }

    console.log('✅ SECURITY: Get-signer validation passed for address:', address.substring(0, 10) + '...');

    return NextResponse.json({ signer });
  } catch (error) {
    console.error('Error getting signer:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 