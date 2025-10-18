import { jwtVerify, createRemoteJWKSet } from "jose";

/**
 * Extended AuthInfo type that includes JWT claims and subject
 * This is compatible with MCP SDK's AuthInfo but adds extra fields we need
 */
export type ExtendedAuthInfo = {
  type: "oauth";
  token: string;
  clientId: string;
  scopes: string[];
  claims?: Record<string, unknown>;
  subject?: string;
  extra?: Record<string, unknown>;
};

/**
 * Verifies an Auth0 JWT token and returns auth info
 * This uses Auth0's JWKS endpoint to validate the token signature
 */
export async function verifyAuth0Token(
  req: Request,
  bearerToken?: string
): Promise<ExtendedAuthInfo | undefined> {
  if (!bearerToken) {
    return undefined;
  }

  try {
    let issuerUrl = process.env.AUTH0_ISSUER_URL || "https://dev-b6psakqdctan3n61.us.auth0.com";
    const audience = process.env.AUTH0_AUDIENCE || "https://mcp.hitl.sh";

    if (!issuerUrl || !audience) {
      console.error("AUTH0_ISSUER_URL and AUTH0_AUDIENCE must be set");
      return undefined;
    }

    // Decode the token to check the actual issuer
    const parts = bearerToken.split(".");
    if (parts.length !== 3) {
      console.error("Invalid JWT format");
      return undefined;
    }

    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8"));
    const tokenIssuer = payload.iss;

    // Auth0 tokens include a trailing slash in the issuer
    // Normalize both to ensure they match
    const normalizeUrl = (url: string) => url.endsWith("/") ? url : `${url}/`;
    issuerUrl = normalizeUrl(issuerUrl);

    console.log("Expected issuer:", issuerUrl);
    console.log("Token issuer:", tokenIssuer);

    // Fetch JWKS from Auth0 and verify the token
    // Remove trailing slash for the JWKS URL
    const jwksUrl = issuerUrl.replace(/\/$/, "");
    const JWKS = createRemoteJWKSet(new URL(`${jwksUrl}/.well-known/jwks.json`));

    // Verify the token signature and claims
    const { payload: verifiedPayload } = await jwtVerify(bearerToken, JWKS, {
      issuer: issuerUrl,
      audience: audience,
    });

    // Return auth info with JWT claims and subject
    return {
      type: "oauth",
      token: bearerToken,
      clientId: verifiedPayload.azp as string || verifiedPayload.aud as string || "",
      scopes: (verifiedPayload.scope as string)?.split(" ") || [],
      claims: verifiedPayload,
      subject: verifiedPayload.sub,
      extra: {
        audience: verifiedPayload.aud,
        issuer: verifiedPayload.iss,
      },
    };
  } catch (error) {
    console.error("Error verifying token:", error);
    return undefined;
  }
}
