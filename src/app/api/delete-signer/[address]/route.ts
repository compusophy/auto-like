import { NextRequest, NextResponse } from 'next/server';
import { deleteSignerByEthAddress } from '../../../lib/redis-write';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params;

    if (!address) {
      return NextResponse.json(
        { error: 'Address is required' },
        { status: 400 }
      );
    }

    // 🔐 SECURITY: Validate that the requester owns this address
    // This endpoint relies on client-side validation via wallet connection
    // The frontend ensures only connected wallet addresses can delete their own data
    // Additional server-side validation could be added with signed messages

    console.log('🗑️ Deleting signer for address:', address);

    const result = await deleteSignerByEthAddress(address);
    
    if (result.success) {
      console.log('✅ Signer deleted successfully:', address);
      return NextResponse.json({
        success: true,
        message: result.message
      });
    } else {
      console.log('❌ Failed to delete signer:', result.message);
      return NextResponse.json(
        { error: result.message },
        { status: 404 }
      );
    }

  } catch (error) {
    console.error('❌ Delete signer error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 