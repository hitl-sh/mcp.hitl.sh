import {
  metadataCorsOptionsRequestHandler,
  generateProtectedResourceMetadata,
} from "mcp-handler";
import { NextRequest } from "next/server";

/**
 * OAuth Protected Resource Metadata endpoint
 * Dynamically generates the resource URL based on the request
 */
function handler(req: NextRequest) {
  // Get the host from the request headers
  const host = req.headers.get('host');
  const protocol = req.headers.get('x-forwarded-proto') ||
                   (host?.includes('localhost') ? 'http' : 'https');

  // Build the resource URL
  const resourceUrl = `${protocol}://${host}/mcp`;

  // Generate the metadata
  const metadata = generateProtectedResourceMetadata({
    authServerUrls: [
      process.env.AUTH0_ISSUER_URL || "https://dev-b6psakqdctan3n61.us.auth0.com",
    ],
    resourceUrl: resourceUrl,
  });

  return new Response(JSON.stringify(metadata), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

const corsHandler = metadataCorsOptionsRequestHandler();

export { handler as GET, corsHandler as OPTIONS };

