import { jwtVerify, createRemoteJWKSet } from "jose";
import { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

/**
 * Verifies an Auth0 JWT token and returns auth info
 * This uses Auth0's JWKS endpoint to validate the token signature
 */
export async function verifyAuth0Token(
  req: Request,
  bearerToken?: string
): Promise<AuthInfo | undefined> {
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

    // Return auth info with scopes and claims
    return {
      type: "oauth",
      accessToken: bearerToken,
      scopes: (verifiedPayload.scope as string)?.split(" ") || [],
      subject: verifiedPayload.sub || "",
      claims: verifiedPayload,
    };
  } catch (error) {
    console.error("Error verifying token:", error);
    return undefined;
  }
}
