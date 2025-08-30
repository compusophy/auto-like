import { NextRequest, NextResponse } from 'next/server';
import { validateSigner } from '../../../lib/signer-validation';

export async function POST(
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
    // The frontend ensures only connected wallet addresses can validate their own data
    // Additional server-side validation could be added with signed messages

    console.log('🔧 Manual signer validation requested for address:', address);

    // Use the shared validation function
    const validationResult = await validateSigner(address);

    return NextResponse.json({
      isValid: validationResult.isValid,
      message: validationResult.message,
      fid: validationResult.fid,
      testHash: validationResult.testHash,
      wasAlreadyValidated: validationResult.wasAlreadyValidated
    });

  } catch (error) {
    console.error('❌ Signer validation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 