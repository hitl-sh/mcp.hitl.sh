#!/usr/bin/env node

/**
 * Stdio MCP server for Claude Desktop and other local MCP clients.
 *
 * Prefer the published package, which needs no clone of this repo:
 *   npx -y @hitl-sh/mcp        (with HITL_API_KEY set)
 *
 * This script runs the same server from @hitl-sh/core, so it registers the same
 * nine tools as the remote endpoints at mcp.hitl.sh.
 */

import { startStdioMcpServer } from "@hitl-sh/core/mcp-stdio";

const apiKey = process.env.HITL_API_KEY;

if (!apiKey) {
  process.stderr.write("Error: HITL_API_KEY environment variable is required\n");
  process.exit(1);
}

await startStdioMcpServer({
  apiKey,
  apiBase: process.env.HITL_API_BASE || undefined,
  serverInfo: { name: "hitl-mcp-server", version: "0.1.0" },
  userAgent: "hitl-mcp-stdio-server/0.1.0",
});
