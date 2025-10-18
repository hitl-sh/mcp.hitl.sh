import { NextRequest, NextResponse } from 'next/server';

/**
 * OAuth 2.0 Authorization Server Metadata endpoint (RFC 8authorization_endpoint514)
 *
 * This provides metadata about the OAuth authorization server.
 * Required for ChatGPT and other OAuth clients to discover configuration.
 */
export async function GET(req: NextRequest) {
  const host = req.headers.get('host');
  const protocol = req.headers.get('x-forwarded-proto') ||
                   (host?.includes('localhost') ? 'http' : 'https');

  const issuer = process.env.AUTH0_ISSUER_URL || "https://dev-b6psakqdctan3n61.us.auth0.com";

  // OAuth Authorization Server Metadata
  const metadata = {
    issuer: issuer,
    authorization_endpoint: `${issuer}/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    userinfo_endpoint: `${issuer}/userinfo`,
    jwks_uri: `${issuer}/.well-known/jwks.json`,

    // Supported features
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["RS256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    code_challenge_methods_supported: ["S256"],

    // Scopes
    scopes_supported: ["openid", "profile", "email", "offline_access"],
  };

  return NextResponse.json(metadata, {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
