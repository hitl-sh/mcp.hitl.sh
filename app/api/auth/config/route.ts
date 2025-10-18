import { NextResponse } from 'next/server';

/**
 * Returns Auth0 configuration for client-side OAuth flows
 * This allows us to use environment variables without exposing secrets
 */
export async function GET() {
  return NextResponse.json({
    issuerUrl: process.env.AUTH0_ISSUER_URL || 'https://dev-b6psakqdctan3n61.us.auth0.com',
    clientId: process.env.AUTH0_CLIENT_ID || 'Hg119LotTNdDHTz9GbNnLhmI0hUsg6Iw',
    audience: process.env.AUTH0_AUDIENCE || 'https://mcp.hitl.sh',
  });
}
