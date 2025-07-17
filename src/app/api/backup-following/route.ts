import { NextRequest, NextResponse } from 'next/server';
import { getSignerByEthAddress } from '../../lib/redis-read';
import { storeBackupData } from '../../lib/redis-write';

// Neynar API configuration
const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY || 'F27E25B1-9B59-494C-85CC-2189447DD04A';
const NEYNAR_API_URL = 'https://api.neynar.com/v2/farcaster';

interface Following {
  fid: number;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
  followerCount?: number;
  followingCount?: number;
  verifiedAddresses?: string[];
}

// Get all following accounts with pagination
async function getAllFollowing(sourceFid: number): Promise<Following[]> {
  const allFollowing: Following[] = [];
  let cursor: string | undefined = undefined;
  const batchSize = 100; // Neynar API limit
  
  console.log(`Starting to fetch all following for FID ${sourceFid}...`);
  
  while (true) {
    try {
      const url: string = `${NEYNAR_API_URL}/following?fid=${sourceFid}&limit=${batchSize}${cursor ? `&cursor=${cursor}` : ''}`;
      
      const response: Response = await fetch(url, {
        headers: {
          'accept': 'application/json',
          'x-api-key': NEYNAR_API_KEY
        }
      });
      
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }
      
      const data: any = await response.json();
      
      if (!data.users || data.users.length === 0) {
        console.log('No more accounts to fetch');
        break;
      }
      
      console.log(`Fetched batch of ${data.users.length} accounts`);
      
      // Process accounts in this batch
      for (const item of data.users) {
        if (item && item.user && item.user.fid && typeof item.user.fid === 'number' && item.user.fid > 0) {
          allFollowing.push({
            fid: item.user.fid,
            username: item.user.username || undefined,
            displayName: item.user.display_name || undefined,
            pfpUrl: item.user.pfp_url || undefined,
            followerCount: item.user.follower_count || undefined,
            followingCount: item.user.following_count || undefined,
            verifiedAddresses: item.user.verified_addresses || undefined
          });
        } else if (item && item.fid && typeof item.fid === 'number' && item.fid > 0) {
          allFollowing.push({
            fid: item.fid,
            username: item.username || undefined,
            displayName: item.display_name || undefined,
            pfpUrl: item.pfp_url || undefined,
            followerCount: item.follower_count || undefined,
            followingCount: item.following_count || undefined,
            verifiedAddresses: item.verified_addresses || undefined
          });
        }
      }
      
      // Check for next cursor
      const nextCursor: string | undefined = data.next?.cursor || data.next_cursor;
      if (!nextCursor) {
        console.log('No more pages available');
        break;
      }
      
      cursor = nextCursor;
      
      // Add a small delay to be respectful to the API
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.error('Error fetching following batch:', error);
      break;
    }
  }
  
  console.log(`Total accounts fetched: ${allFollowing.length}`);
  return allFollowing;
}

// Convert data to CSV format
function convertToCSV(data: Following[]): string {
  const headers = [
    'FID',
    'Username',
    'Display Name',
    'Profile Picture URL',
    'Follower Count',
    'Following Count',
    'Verified Addresses'
  ];
  
  const csvRows = [headers.join(',')];
  
  for (const account of data) {
    const row = [
      account.fid,
      account.username ? `"${account.username.replace(/"/g, '""')}"` : '',
      account.displayName ? `"${account.displayName.replace(/"/g, '""')}"` : '',
      account.pfpUrl ? `"${account.pfpUrl}"` : '',
      account.followerCount || '',
      account.followingCount || '',
      Array.isArray(account.verifiedAddresses) && account.verifiedAddresses.length > 0 ? `"${account.verifiedAddresses.join(';')}"` : ''
    ];
    csvRows.push(row.join(','));
  }
  
  return csvRows.join('\n');
}

export async function POST(request: NextRequest) {
  try {
    const { signerData } = await request.json();
    
    if (!signerData || !signerData.fid) {
      return NextResponse.json({ error: 'Valid signer data is required' }, { status: 400 });
    }
    
    const sourceFid = parseInt(signerData.fid);
    if (isNaN(sourceFid)) {
      return NextResponse.json({ error: 'Invalid FID in signer data' }, { status: 400 });
    }
    
    // Get all following accounts
    const following = await getAllFollowing(sourceFid);
    
    if (following.length === 0) {
      return NextResponse.json({ 
        message: 'No following accounts found',
        count: 0,
        csvData: ''
      });
    }
    
    // Store backup data in Redis
    await storeBackupData(signerData.address, following);
    
    // Convert to CSV for download
    const csvData = convertToCSV(following);
    
    return NextResponse.json({
      message: `Successfully backed up ${following.length} following accounts`,
      count: following.length,
      csvData,
      accounts: following
    });
    
  } catch (error) {
    console.error('Backup following error:', error);
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
  }
} 