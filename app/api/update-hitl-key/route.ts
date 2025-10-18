import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth0Token } from '@/lib/auth0-verify';

/**
 * API endpoint to update user's HITL API key in Auth0 user metadata
 *
 * This endpoint requires the user to be authenticated via OAuth.
 * It updates the user's metadata in Auth0 with their HITL API key.
 */
export async function POST(req: NextRequest) {
  try {
    const { hitl_api_key } = await req.json();

    if (!hitl_api_key || typeof hitl_api_key !== 'string') {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 400 }
      );
    }

    // Validate API key format (should start with hitl_live_ or hitl_test_)
    if (!hitl_api_key.startsWith('hitl_live_') && !hitl_api_key.startsWith('hitl_test_')) {
      return NextResponse.json(
        { error: 'Invalid API key format. Key should start with hitl_live_ or hitl_test_' },
        { status: 400 }
      );
    }

    // Get and verify the OAuth token
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Not authenticated. Please log in first.' },
        { status: 401 }
      );
    }

    const token = authHeader.replace('Bearer ', '');

    // Verify the token and get user info
    const authInfo = await verifyAuth0Token(req, token);
    if (!authInfo || !authInfo.subject) {
      return NextResponse.json(
        { error: 'Invalid or expired token. Please log in again.' },
        { status: 401 }
      );
    }

    const userId = authInfo.subject; // This is the Auth0 user ID (e.g., "auth0|123456")

    // Update user metadata in Auth0
    await updateAuth0UserMetadata(userId, { hitl_api_key });

    return NextResponse.json({
      success: true,
      message: 'HITL API key saved successfully. Please log out and log back in for changes to take effect.'
    });

  } catch (error) {
    console.error('Error updating HITL API key:', error);
    return NextResponse.json(
      {
        error: 'Failed to update API key',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * Updates Auth0 user metadata using the Management API
 */
async function updateAuth0UserMetadata(userId: string, metadata: Record<string, unknown>) {
  const domain = process.env.AUTH0_ISSUER_URL;

  if (!domain) {
    throw new Error('AUTH0_ISSUER_URL not configured');
  }

  // Get a Management API token
  const managementApiToken = await getManagementApiToken();

  // URL encode the user ID (e.g., "auth0|123456" becomes "auth0%7C123456")
  const encodedUserId = encodeURIComponent(userId);

  const response = await fetch(
    `${domain}/api/v2/users/${encodedUserId}`,
    {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${managementApiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_metadata: metadata,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Auth0 Management API error:', errorText);
    throw new Error(`Failed to update user metadata: ${response.status} ${errorText}`);
  }

  return response.json();
}

/**
 * Gets an access token for the Auth0 Management API
 * Uses the Machine-to-Machine application credentials
 */
async function getManagementApiToken(): Promise<string> {
  const domain = process.env.AUTH0_ISSUER_URL;
  const clientId = process.env.AUTH0_MANAGEMENT_CLIENT_ID;
  const clientSecret = process.env.AUTH0_MANAGEMENT_CLIENT_SECRET;

  if (!domain || !clientId || !clientSecret) {
    throw new Error(
      'Missing Auth0 Management API credentials. ' +
      'Please set AUTH0_MANAGEMENT_CLIENT_ID and AUTH0_MANAGEMENT_CLIENT_SECRET'
    );
  }

  const response = await fetch(`${domain}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      audience: `${domain}/api/v2/`,
      grant_type: 'client_credentials',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Failed to get Management API token:', errorText);
    throw new Error(`Failed to get Management API token: ${response.status}`);
  }

  const data = await response.json();

  if (!data.access_token) {
    throw new Error('No access token in Management API response');
  }

  return data.access_token;
}
