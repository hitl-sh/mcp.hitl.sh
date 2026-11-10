import { AsyncLocalStorage } from "node:async_hooks";

import { HitlClient } from "@hitl-sh/core/client";
import { HITL_SERVER_INSTRUCTIONS, HITL_TOOL_DESCRIPTIONS, HITL_TOOL_NAMES, registerHitlTools } from "@hitl-sh/core/mcp-tools";
import { createMcpHandler } from "mcp-handler";

const USER_AGENT = "hitl-mcp-server-simple/0.1.0";

// AsyncLocalStorage to pass Request through tool handlers
const requestStorage = new AsyncLocalStorage<Request>();

function currentRequest(): Request {
  const req = requestStorage.getStore();
  if (!req) throw new Error("Request object not available");
  return req;
}

// Custom auth function that validates HITL API key from Bearer token
function validateApiKeyAuth(req: Request): string {
  const authHeader = req.headers.get('authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error(
      "⚠️ HITL API Key Required\n\n" +
      "Please provide your HITL.sh API key in the Authorization header:\n" +
      "Authorization: Bearer hitl_live_your_api_key\n\n" +
      "Get your API key at: https://my.hitl.sh/dashboard"
    );
  }

  const apiKey = authHeader.replace('Bearer ', '').trim();

  // Validate API key format
  if (!apiKey.startsWith('hitl_live_') && !apiKey.startsWith('hitl_test_')) {
    throw new Error(
      "⚠️ Invalid HITL API Key Format\n\n" +
      "API key must start with 'hitl_live_' or 'hitl_test_'\n\n" +
      "Get your API key at: https://my.hitl.sh/dashboard"
    );
  }

  return apiKey;
}

function createClient(): HitlClient {
  const hitlApiKey = validateApiKeyAuth(currentRequest());
  console.log("Using HITL API key from Bearer token (simple auth)");

  return new HitlClient(hitlApiKey, {
    userAgent: USER_AGENT,
    ...(process.env.HITL_API_BASE ? { baseUrl: process.env.HITL_API_BASE } : {}),
    // Extra hosts allowed to receive the key, e.g. "localhost" for a local API (comma-separated)
    allowHosts: (process.env.HITL_ALLOW_HOSTS ?? "").split(",").map((h) => h.trim()).filter(Boolean),
  });
}

const baseHandler = createMcpHandler(
  async (server) => {
    registerHitlTools(server, { getClient: createClient });
  },
  {
    serverInfo: {
      name: "hitl-simple",
      version: "1.0.0",
    },
    // HITL is workflows-only: the tools are core's workflow set (find and run, build, who reviews, account).
    instructions: HITL_SERVER_INSTRUCTIONS,
    capabilities: {
      tools: Object.fromEntries(HITL_TOOL_NAMES.map((tool) => [tool, { description: HITL_TOOL_DESCRIPTIONS[tool] }])),
    },
  },
  {
    // mcp-handler only answers on this exact path, so it must match the route folder.
    streamableHttpEndpoint: "/mcp-simple",
    verboseLogs: process.env.NODE_ENV !== "production",
    maxDuration: 90,
    disableSse: true,
  },
);

// Wrapper to inject Request into AsyncLocalStorage
const handler = async (req: Request) => requestStorage.run(req, () => baseHandler(req));

export { handler as GET, handler as POST, handler as DELETE };
