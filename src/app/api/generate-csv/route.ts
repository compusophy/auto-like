import { NextRequest, NextResponse } from 'next/server';
import { getBackupData } from '../../lib/redis-write';

// Convert data to CSV format (same as in backup API)
function convertToCSV(data: any[]): string {
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
    
    if (!signerData || !signerData.address) {
      return NextResponse.json({ error: 'Valid signer data is required' }, { status: 400 });
    }
    
    // Get backup data from Redis
    const backupData = await getBackupData(signerData.address);
    
    if (!backupData || backupData.length === 0) {
      return NextResponse.json({ error: 'No backup data found' }, { status: 404 });
    }
    
    // Convert to CSV
    const csvData = convertToCSV(backupData);
    
    return NextResponse.json({
      csvData,
      count: backupData.length
    });
    
  } catch (error) {
    console.error('Generate CSV error:', error);
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
  }
} 