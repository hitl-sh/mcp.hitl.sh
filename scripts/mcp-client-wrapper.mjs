#!/usr/bin/env node

/**
 * MCP stdio wrapper for Claude Desktop
 *
 * This script acts as a bridge between Claude Desktop (stdio transport)
 * and the HITL MCP HTTP server.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";

// Configuration
const SERVER_URL = process.env.HITL_MCP_URL || "http://localhost:3002/mcp";
const API_KEY = process.env.HITL_API_KEY || "";

if (!API_KEY) {
  console.error("Error: HITL_API_KEY environment variable is required");
  process.exit(1);
}

// Create HTTP client to connect to our MCP server
const httpTransport = new StreamableHTTPClientTransport(new URL(SERVER_URL), {
  requestInit: {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
    },
  },
});

const httpClient = new Client({
  name: "hitl-mcp-stdio-wrapper",
  version: "0.1.0",
});

// Create stdio server for Claude Desktop
const stdioServer = new Server(
  {
    name: "hitl-mcp-server",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Forward tool list requests
stdioServer.setRequestHandler("tools/list", async () => {
  const tools = await httpClient.listTools();
  return tools;
});

// Forward tool call requests
stdioServer.setRequestHandler("tools/call", async (request) => {
  const result = await httpClient.callTool(request.params);
  return result;
});

// Start the wrapper
async function main() {
  try {
    // Connect to HTTP server
    await httpClient.connect(httpTransport);

    // Start stdio server for Claude Desktop
    const transport = new StdioServerTransport();
    await stdioServer.connect(transport);

    console.error("HITL MCP stdio wrapper started successfully");
  } catch (error) {
    console.error("Failed to start MCP wrapper:", error);
    process.exit(1);
  }
}

main();
