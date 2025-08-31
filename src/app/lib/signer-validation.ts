import { getSignerByEthAddress } from './redis-read';
import { completeSignerValidation, deleteSignerByEthAddress } from './redis-write';
import {
  NobleEd25519Signer,
  makeLinkAdd,
  FarcasterNetwork,
  Message
} from '@farcaster/hub-nodejs';
import { hexToBytes } from '@noble/hashes/utils';

// Helper function to check if a pending signer should be cleaned up
async function shouldCleanupOldPendingSigner(signer: any): Promise<boolean> {
  if (!signer.isPending || !signer.createdAt) {
    return false;
  }

  const oneHourAgo = Date.now() - (60 * 60 * 1000); // 1 hour in milliseconds
  return signer.createdAt < oneHourAgo;
}

// Helper function to cleanup old pending signer
async function cleanupOldPendingSigner(address: string, signer: any): Promise<void> {
  if (await shouldCleanupOldPendingSigner(signer)) {
    console.log(`🧹 Cleaning up old pending signer for ${address} (created ${Math.round((Date.now() - signer.createdAt) / (60 * 1000))} minutes ago)`);
    await deleteSignerByEthAddress(address);
  }
}

// Shared signer validation function
export async function validateSigner(address: string): Promise<{
  isValid: boolean;
  message: string;
  fid?: string;
  testHash?: string;
  wasAlreadyValidated?: boolean;
}> {
  try {
    console.log('🔧 Validating signer for address:', address);

    // Get signer from database
    const signer = await getSignerByEthAddress(address);

    if (!signer) {
      console.log('❌ No signer found in database for address:', address);
      return { isValid: false, message: 'No signer found for this address' };
    }

    // Check if this is an old pending signer that should be cleaned up
    if (signer.isPending && !signer.isValidated) {
      await cleanupOldPendingSigner(address, signer);
    }

    console.log('📋 Signer found in database:', {
      fid: signer.fid,
      isValidated: signer.isValidated,
      isPending: signer.isPending,
      hasToken: !!signer.token
    });

    // Check if already validated
    if (signer.isValidated && !signer.isPending) {
      console.log('🔄 Signer already validated, returning success');
      return {
        isValid: true,
        message: 'Signer already validated',
        fid: signer.fid,
        wasAlreadyValidated: true
      };
    }

    if (!signer.token) {
      console.log('❌ No token found for signer, cannot validate');
      // Cleanup old pending signer with no token
      await cleanupOldPendingSigner(address, signer);
      return { isValid: false, message: 'No token found - cannot validate' };
    }

    console.log('🔍 Checking signed key request status via Farcaster API...');
    console.log('🔑 Using token:', signer.token);

    // Test the signer by attempting a follow operation
    try {
      console.log('🧪 Testing signer by attempting follow operation...');

      // Import required modules dynamically
      if (!signer.fid) {
        return { isValid: false, message: 'No FID found for signer' };
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
        return {
          isValid: validationResult.isValid,
          message: validationResult.isValid ? 'Signer validated (same FID as target)' : 'Failed to validate signer',
          fid: signer.fid
        };
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
        return {
          isValid: false,
          message: `Failed to create test message: ${messageResult.error}`
        };
      }

      // Submit to Farcaster hub via Neynar
      const neynarApiKey = process.env.NEYNAR_API_KEY;
      if (!neynarApiKey) {
        return { isValid: false, message: 'NEYNAR_API_KEY not configured' };
      }

      const response = await fetch('https://hub-api.neynar.com/v1/submitMessage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-API-KEY': neynarApiKey
        },
        body: Buffer.from(Message.encode(messageResult.value).finish())
      });

      if (response.ok) {
        const responseData = await response.arrayBuffer();
        const hash = `0x${Buffer.from(responseData).toString("hex")}`;
        console.log(`✅ Follow test successful! Hash: ${hash}`);

        // Update the signer as validated
        const validationResult = await completeSignerValidation(address, signer.fid);

        return {
          isValid: true,
          message: 'Signer validated successfully!',
          fid: signer.fid,
          testHash: hash
        };
      } else {
        const errorText = await response.text();
        console.log(`❌ Follow test failed: ${errorText}`);

        // Check if it's an invalid signer error
        const isInvalidSigner = errorText.toLowerCase().includes('invalid signer') ||
                               errorText.toLowerCase().includes('unknown_signer') ||
                               errorText.toLowerCase().includes('unauthorized');

        if (isInvalidSigner) {
          // Cleanup invalid signer
          await cleanupOldPendingSigner(address, signer);
          return { isValid: false, message: 'Signer is invalid or not approved' };
        } else {
          return { isValid: false, message: `Test failed: ${errorText}` };
        }
      }

    } catch (testError) {
      console.error('❌ Signer test error:', testError);
      // Cleanup on test errors for old pending signers
      await cleanupOldPendingSigner(address, signer);
      return { isValid: false, message: 'Failed to test signer' };
    }

  } catch (error) {
    console.error('❌ Signer validation error:', error);
    // Try to cleanup old pending signer on general errors
    try {
      const signer = await getSignerByEthAddress(address);
      if (signer) {
        await cleanupOldPendingSigner(address, signer);
      }
    } catch (cleanupError) {
      console.error('❌ Error during cleanup:', cleanupError);
    }
    return { isValid: false, message: 'Internal server error' };
  }
}
