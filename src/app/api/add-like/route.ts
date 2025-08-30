import { NextRequest, NextResponse } from 'next/server';
import { getSignerByEthAddress } from '../../lib/redis-read';
import { 
  NobleEd25519Signer, 
  makeReactionAdd,
  ReactionType,
  FarcasterNetwork,
  Message
} from '@farcaster/hub-nodejs';
import { hexToBytes } from '@noble/hashes/utils';

// Neynar API configuration
const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;

interface LikeRequest {
  signerAddress: string;
  targetCastHash: string;
  targetFid: number;
}

// Add like reaction to a cast
async function addLikeReaction(
  fid: number, 
  privateKeyHex: string, 
  targetCastHash: string,
  targetFid: number
): Promise<{ success: boolean; hash?: string; error?: string }> {
  try {
    if (!NEYNAR_API_KEY) {
      throw new Error('NEYNAR_API_KEY not configured');
    }

    // Remove '0x' prefix if present
    const cleanPrivateKey = privateKeyHex.replace('0x', '');
    
    // Convert private key to proper format and create signer
    const privateKeyBytes = hexToBytes(cleanPrivateKey);
    const signer = new NobleEd25519Signer(privateKeyBytes);

    // Remove '0x' prefix from cast hash if present
    const cleanCastHash = targetCastHash.replace('0x', '');
    
    // Create the like reaction message
    const messageResult = await makeReactionAdd(
      {
        type: ReactionType.LIKE,
        targetCastId: {
          fid: targetFid, // Use the FID of the cast author
          hash: hexToBytes(cleanCastHash)
        }
      },
      {
        fid: fid,
        network: FarcasterNetwork.MAINNET
      },
      signer
    );

    if (!messageResult.isOk()) {
      return { success: false, error: messageResult.error.message || String(messageResult.error) };
    }

    // Get the message
    const message = messageResult.value;
    
    // Ensure dataBytes is set (required for Snapchain)
    if (!message.dataBytes) {
      return { success: false, error: 'Message is missing dataBytes' };
    }

    console.log(`Message has dataBytes: ${message.dataBytes.length} bytes`);
    console.log(`Message hash: ${Buffer.from(message.hash).toString('hex')}`);
    
    // Encode the message to binary
    const messageBytes = Buffer.from(Message.encode(message).finish());
    
    console.log("Submitting like via HTTP API...");
    
    // Use Neynar's HTTP API
    const neynarEndpoint = 'https://hub-api.neynar.com/v1/submitMessage';
    
    const response = await fetch(neynarEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-API-KEY': NEYNAR_API_KEY
      },
      body: messageBytes
    });
    
    if (response.ok) {
      const responseData = await response.arrayBuffer();
      const hash = `0x${Buffer.from(responseData).toString("hex")}`;
      console.log(`Like submitted successfully for FID ${fid} -> ${targetFid}! Hash: ${hash}`);
      return { success: true, hash };
    } else {
      const errorText = await response.text();
      console.error(`Failed to submit like:`, errorText);
      return { success: false, error: errorText };
    }

  } catch (error) {
    console.error(`Failed to add like for FID ${fid} -> ${targetFid}:`, error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function POST(request: NextRequest) {
  try {
    const { signerAddress, targetCastHash, targetFid }: LikeRequest = await request.json();
    
    console.log('Received like request:', { 
      signerAddress, 
      targetCastHash, 
      targetFid 
    });
    
    if (!signerAddress || !targetCastHash || !targetFid) {
      return NextResponse.json({ 
        error: 'signerAddress, targetCastHash, and targetFid are required' 
      }, { status: 400 });
    }
    
    // Get signer from database
    const signer = await getSignerByEthAddress(signerAddress);
    
    if (!signer) {
      return NextResponse.json({ 
        error: 'No signer found for this address' 
      }, { status: 404 });
    }

    if (!signer.isValidated) {
      return NextResponse.json({ 
        error: 'Signer is not validated' 
      }, { status: 403 });
    }

    if (!signer.fid || !signer.privateKey) {
      return NextResponse.json({ 
        error: 'Signer data is incomplete' 
      }, { status: 400 });
    }
    
    console.log(`Adding like from FID ${signer.fid} to cast ${targetCastHash} by FID ${targetFid}`);
    
    // Add the like reaction
    const result = await addLikeReaction(
      parseInt(signer.fid), 
      signer.privateKey, 
      targetCastHash,
      targetFid
    );
    
    if (result.success) {
      console.log(`✅ Successfully liked cast ${targetCastHash}`);
      return NextResponse.json({
        success: true,
        message: 'Like added successfully',
        hash: result.hash,
        likerFid: signer.fid,
        targetCastHash,
        targetFid
      });
    } else {
      console.log(`❌ Failed to like cast ${targetCastHash}: ${result.error}`);
      return NextResponse.json({
        success: false,
        error: result.error
      }, { status: 500 });
    }
    
  } catch (error) {
    console.error('Add like error:', error);
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
  }
}
