#!/usr/bin/env node

/**
 * Lightweight sanity check for the HITL MCP server.
 *
 * Usage:
 *    node scripts/test-hitl-mcp.mjs http://localhost:3000/mcp YOUR_HITL_API_KEY
 *
 * Alternatively set HITL_API_KEY in the environment and omit the second argument.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

function printUsage() {
  console.log(
    "Usage: node scripts/test-hitl-mcp.mjs <server-url> [api-key]\n" +
      "Example: node scripts/test-hitl-mcp.mjs http://localhost:3000/mcp sk_live_XXX",
  );
}

const [, , serverUrlArg, apiKeyArg] = process.argv;

if (!serverUrlArg) {
  console.error("Missing MCP server URL.");
  printUsage();
  process.exit(1);
}

const apiKey = apiKeyArg ?? process.env.HITL_API_KEY;

if (!apiKey) {
  console.error("Missing HITL API key.");
  printUsage();
  process.exit(1);
}

const serverUrl = new URL(serverUrlArg);
const transport = new StreamableHTTPClientTransport(serverUrl, {
  requestInit: {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  },
});

const client = new Client({
  name: "hitl-mcp-test-client",
  version: "0.1.0",
});

async function main() {
  await client.connect(transport);

  const tools = await client.listTools();
  console.log(
    "Available tools:",
    tools.tools?.map((tool) => `${tool.name} – ${tool.description ?? tool.annotations?.description ?? ""}`),
  );

  const loops = await client.callTool({
    name: "list_loops",
    arguments: {},
  });
  console.log("list_loops response:", JSON.stringify(loops, null, 2));

  const requests = await client.callTool({
    name: "list_requests",
    arguments: { limit: 3 },
  });
  console.log("list_requests response:", JSON.stringify(requests, null, 2));
}

main()
  .catch((error) => {
    console.error("Test invocation failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (typeof client.close === "function") {
      await client.close();
    }
    if (typeof transport.close === "function") {
      await transport.close();
    }
  });

