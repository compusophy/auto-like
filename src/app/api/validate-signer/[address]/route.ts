import { NextRequest, NextResponse } from 'next/server';
import { getSignerByEthAddress } from '../../../lib/redis-read';
import { completeSignerValidation } from '../../../lib/redis-write';

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

    console.log('🔧 Validating signer for address:', address);

    // Get signer from database
    const signer = await getSignerByEthAddress(address);
    
    if (!signer) {
      console.log('❌ No signer found in database for address:', address);
      return NextResponse.json(
        { error: 'No signer found for this address' },
        { status: 404 }
      );
    }

    console.log('📋 Signer found in database:', {
      fid: signer.fid,
      isValidated: signer.isValidated,
      isPending: signer.isPending,
      hasToken: !!signer.token
    });

    // Note: We'll still perform the validation check even if already validated
    // This allows for revalidation to ensure the signer still works
    if (signer.isValidated && !signer.isPending) {
      console.log('🔄 Signer already validated, but performing revalidation check...');
    }

    if (!signer.token) {
      console.log('❌ No token found for signer, cannot validate');
      return NextResponse.json({
        isValid: false,
        message: 'No token found - cannot validate'
      }, { status: 400 });
    }

    console.log('🔍 Checking signed key request status via Farcaster API...');
    console.log('🔑 Using token:', signer.token);

    // Test the signer by attempting a follow operation
    try {
      console.log('🧪 Testing signer by attempting follow operation...');
      
      // Import required modules dynamically
      const { NobleEd25519Signer, makeLinkAdd, FarcasterNetwork } = await import('@farcaster/hub-nodejs');
      const { hexToBytes } = await import('@noble/hashes/utils');
      
      if (!signer.fid) {
        return NextResponse.json({
          isValid: false,
          message: 'No FID found for signer'
        });
      }

      // Prepare the private key
      const cleanPrivateKey = signer.privateKey.replace('0x', '');
      const privateKeyBytes = hexToBytes(cleanPrivateKey);
      const ed25519Signer = new NobleEd25519Signer(privateKeyBytes);

      // Target FID to follow (use a known FID that exists)
      const targetFid = 373255; // Your FID
      
      // Skip if this signer's FID is the same as our target (can't follow yourself)
      if (parseInt(signer.fid) === targetFid) {
        console.log('⏭️ Skipping follow test - same FID as target');
        // Mark as valid since we can't test it
        const validationResult = await completeSignerValidation(address, signer.fid);
        return NextResponse.json({
          isValid: validationResult.isValid,
          message: validationResult.isValid ? 'Signer validated (same FID as target)' : 'Failed to validate signer',
          fid: signer.fid
        });
      }

      console.log(`🔍 Testing signer for FID ${signer.fid} by following FID ${targetFid}`);

      // Create a follow message
      const messageResult = await makeLinkAdd(
        {
          type: "follow",
          targetFid: targetFid
        },
        {
          fid: parseInt(signer.fid),
          network: FarcasterNetwork.MAINNET
        },
        ed25519Signer
      );

      if (!messageResult.isOk()) {
        console.log('❌ Failed to create follow message:', messageResult.error);
        return NextResponse.json({
          isValid: false,
          message: `Failed to create test message: ${messageResult.error}`
        });
      }

      // Submit to Farcaster hub via Neynar
      const { Message } = await import('@farcaster/hub-nodejs');
      const messageBytes = Buffer.from(Message.encode(messageResult.value).finish());

      const neynarApiKey = process.env.NEYNAR_API_KEY;
      if (!neynarApiKey) {
        return NextResponse.json({
          isValid: false,
          message: 'NEYNAR_API_KEY not configured'
        });
      }

      const response = await fetch('https://hub-api.neynar.com/v1/submitMessage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-API-KEY': neynarApiKey
        },
        body: messageBytes
      });

      if (response.ok) {
        const responseData = await response.arrayBuffer();
        const hash = `0x${Buffer.from(responseData).toString("hex")}`;
        console.log(`✅ Follow test successful! Hash: ${hash}`);
        
        // Update the signer as validated
        const validationResult = await completeSignerValidation(address, signer.fid);
        
        return NextResponse.json({
          isValid: true,
          message: 'Signer validated successfully!',
          fid: signer.fid,
          testHash: hash
        });
      } else {
        const errorText = await response.text();
        console.log(`❌ Follow test failed: ${errorText}`);
        
        // Check if it's an invalid signer error
        const isInvalidSigner = errorText.toLowerCase().includes('invalid signer') ||
                               errorText.toLowerCase().includes('unknown_signer') ||
                               errorText.toLowerCase().includes('unauthorized');
        
        if (isInvalidSigner) {
          return NextResponse.json({
            isValid: false,
            message: 'Signer is invalid or not approved'
          });
        } else {
          return NextResponse.json({
            isValid: false,
            message: `Test failed: ${errorText}`
          });
        }
      }
      
    } catch (testError) {
      console.error('❌ Signer test error:', testError);
      return NextResponse.json({
        isValid: false,
        message: 'Failed to test signer'
      }, { status: 500 });
    }

  } catch (error) {
    console.error('❌ Signer validation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 