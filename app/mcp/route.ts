import { AsyncLocalStorage } from "node:async_hooks";

/* Local structural AuthInfo type to avoid deep import path issues */
type AuthInfo = {
  token: string;
  clientId: string;
  scopes: string[];
  claims?: Record<string, unknown>;
  subject?: string;
  extra?: Record<string, unknown>;
};

import { HitlClient } from "@hitl-sh/core/client";
import { HITL_TOOL_DESCRIPTIONS, registerHitlTools, type ToolExtra } from "@hitl-sh/core/mcp-tools";
import { rememberClientInfo, resolveRequestSource } from "@hitl-sh/core/request-source";
import { createMcpHandler, withMcpAuth } from "mcp-handler";

import { verifyAuth0Token } from "@/lib/auth0-verify";

const USER_AGENT = "hitl-mcp-server/0.1.0";

const authStorage = new AsyncLocalStorage<AuthInfo | undefined>();

function createClient(extra: ToolExtra): HitlClient {
  const authInfo = (extra.authInfo as AuthInfo | undefined) ?? authStorage.getStore();

  // Try to get HITL API key from user's OAuth claims first (per-user key)
  // Check both namespaced and non-namespaced claims
  let hitlApiKey =
    (authInfo?.claims?.["https://mcp.hitl.sh/hitl_api_key"] as string | undefined) ||
    (authInfo?.claims?.hitl_api_key as string | undefined);

  if (!hitlApiKey) {
    // No personal key - check for shared fallback
    hitlApiKey = process.env.HITL_API_KEY;

    if (!hitlApiKey) {
      // NO KEY AT ALL - show helpful error with setup instructions
      throw new Error(
        "⚠️ HITL API Key Required\n\n" +
        "Please add your HITL.sh API key to use this service:\n\n" +
        "1. Visit: https://mcp.hitl.sh/setup-api-key\n" +
        "2. Log in with your ChatGPT credentials\n" +
        "3. Enter your HITL API key\n" +
        "4. Reconnect in ChatGPT\n\n" +
        "Get your API key at: https://my.hitl.sh/dashboard"
      );
    }

    // Using shared fallback key
    console.log("Using shared HITL_API_KEY from environment (user has no personal key)");
  } else {
    // Using user's personal key
    console.log("Using user's personal HITL API key from OAuth claims");
  }

  return new HitlClient(hitlApiKey, {
    userAgent: USER_AGENT,
    ...(process.env.HITL_API_BASE ? { baseUrl: process.env.HITL_API_BASE } : {}),
    // Extra hosts allowed to receive the key, e.g. "localhost" for a local API (comma-separated)
    allowHosts: (process.env.HITL_ALLOW_HOSTS ?? "").split(",").map((h) => h.trim()).filter(Boolean),
  });
}

const baseHandler = createMcpHandler(
  async (server) => {
    registerHitlTools(server, {
      getClient: createClient,
      // Where the request came from (MCP client), shown to reviewers in the portal
      resolveSource: (extra, hint) => resolveRequestSource(extra.requestInfo?.headers, hint),
    });
  },
  {
    serverInfo: {
      name: "hitl-mcp-server",
      version: "0.1.0",
    },
    capabilities: {
      tools: Object.fromEntries(
        Object.entries(HITL_TOOL_DESCRIPTIONS).map(([name, description]) => [name, { description }]),
      ),
    },
  },
  {
    basePath: "",
    verboseLogs: process.env.NODE_ENV !== "production",
    maxDuration: 90,
    disableSse: true,
  },
);

const handler = async (req: Request) => {
  await rememberClientInfo(req);
  return authStorage.run((req as { auth?: AuthInfo }).auth, () => baseHandler(req));
};

// Use Auth0 OAuth verification for authentication
const authHandler = withMcpAuth(handler, verifyAuth0Token, {
  required: true,  // OAuth authentication is required
  // Optional: specify required scopes
  // requiredScopes: ["read:loops", "write:requests"],
});

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
