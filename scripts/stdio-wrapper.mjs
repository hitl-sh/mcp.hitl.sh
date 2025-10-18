#!/usr/bin/env node

/**
 * MCP stdio wrapper for Claude Desktop
 * Properly implements stdio transport with line-delimited JSON-RPC
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import readline from "readline";

const SERVER_URL = process.env.HITL_MCP_URL || "http://localhost:3002/mcp";
const API_KEY = process.env.HITL_API_KEY;

if (!API_KEY) {
  console.error("HITL_API_KEY environment variable is required");
  process.exit(1);
}

// Create HTTP client
const transport = new StreamableHTTPClientTransport(new URL(SERVER_URL), {
  requestInit: {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
    },
  },
});

const client = new Client({
  name: "hitl-stdio-wrapper",
  version: "0.1.0",
});

let isConnected = false;

// Create readline interface for line-based input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

// Function to send response
function sendResponse(response) {
  process.stdout.write(JSON.stringify(response) + "\n");
}

// Handle incoming messages
rl.on("line", async (line) => {
  try {
    const message = JSON.parse(line);

    // Handle initialize
    if (message.method === "initialize") {
      if (!isConnected) {
        await client.connect(transport);
        isConnected = true;
      }

      sendResponse({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: "hitl-mcp-server",
            version: "0.1.0",
          },
        },
      });
    }
    // Handle initialized notification
    else if (message.method === "notifications/initialized") {
      // No response for notifications
    }
    // Handle tools/list
    else if (message.method === "tools/list") {
      const result = await client.listTools();
      sendResponse({
        jsonrpc: "2.0",
        id: message.id,
        result: result,
      });
    }
    // Handle tools/call
    else if (message.method === "tools/call") {
      const result = await client.callTool(message.params);
      sendResponse({
        jsonrpc: "2.0",
        id: message.id,
        result: result,
      });
    }
    // Handle resources/list
    else if (message.method === "resources/list") {
      sendResponse({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          resources: [],
        },
      });
    }
    // Handle prompts/list
    else if (message.method === "prompts/list") {
      sendResponse({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          prompts: [],
        },
      });
    }
    // Handle ping
    else if (message.method === "ping") {
      sendResponse({
        jsonrpc: "2.0",
        id: message.id,
        result: {},
      });
    }
    // Unknown method
    else {
      sendResponse({
        jsonrpc: "2.0",
        id: message.id,
        error: {
          code: -32601,
          message: `Method not found: ${message.method}`,
        },
      });
    }
  } catch (error) {
    // Send error response
    try {
      const message = JSON.parse(line);
      sendResponse({
        jsonrpc: "2.0",
        id: message.id || null,
        error: {
          code: -32603,
          message: error.message || "Internal error",
          data: {
            stack: error.stack,
          },
        },
      });
    } catch (parseError) {
      sendResponse({
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32700,
          message: "Parse error",
        },
      });
    }
  }
});

// Handle process termination
process.on("SIGINT", () => {
  process.exit(0);
});

process.on("SIGTERM", () => {
  process.exit(0);
});

// Log errors to stderr (won't interfere with stdout JSON-RPC)
process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (error) => {
  console.error("Unhandled rejection:", error);
  process.exit(1);
});
