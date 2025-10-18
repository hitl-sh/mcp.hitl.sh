#!/usr/bin/env node

/**
 * Direct stdio MCP server for Claude Desktop
 * No HTTP wrapper - implements MCP directly
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createHitlClient } from "../lib/hitl-client.ts";
import { z } from "zod";

const API_KEY = process.env.HITL_API_KEY;

if (!API_KEY) {
  process.stderr.write("Error: HITL_API_KEY environment variable is required\n");
  process.exit(1);
}

// Create HITL client
const hitlClient = createHitlClient(API_KEY, {
  userAgent: "hitl-mcp-stdio-server/0.1.0",
});

// Create MCP server
const server = new Server(
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

// Tool schemas
const createRequestSchema = z.object({
  loop_id: z.string(),
  processing_type: z.enum(["time-sensitive", "deferred"]),
  type: z.enum(["markdown", "image"]),
  priority: z.enum(["low", "medium", "high", "critical"]),
  request_text: z.string(),
  timeout_seconds: z.number().optional(),
  response_type: z.enum(["single_select", "multi_select", "rating", "text", "number"]),
  response_config: z.record(z.unknown()),
  default_response: z.unknown(),
  platform: z.string().optional(),
  image_url: z.string().optional(),
  context: z.record(z.unknown()).optional(),
  callback_url: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const listRequestsSchema = z.object({
  status: z.enum(["pending", "claimed", "completed", "timeout", "cancelled"]).optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  loop_id: z.string().optional(),
  limit: z.number().optional(),
  offset: z.number().optional(),
  sort: z.enum(["created_at_desc", "created_at_asc", "priority_desc", "status_asc"]).optional(),
});

// Register tools
server.setRequestHandler("tools/list", async () => {
  return {
    tools: [
      {
        name: "list_loops",
        description: "Retrieve all loops owned by the authenticated HITL.sh account.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "create_request",
        description: "Create a new review request within a specific loop and broadcast it to reviewers.",
        inputSchema: zodToJsonSchema(createRequestSchema),
      },
      {
        name: "list_requests",
        description: "List requests created by the authenticated API key with optional filters.",
        inputSchema: zodToJsonSchema(listRequestsSchema),
      },
      {
        name: "get_request",
        description: "Fetch detailed information about a single request by its identifier.",
        inputSchema: {
          type: "object",
          properties: {
            request_id: { type: "string" },
          },
          required: ["request_id"],
        },
      },
      {
        name: "update_request",
        description: "Update mutable fields of a request, such as text, priority, or configuration.",
        inputSchema: {
          type: "object",
          properties: {
            request_id: { type: "string" },
            updates: { type: "object" },
          },
          required: ["request_id", "updates"],
        },
      },
      {
        name: "cancel_request",
        description: "Cancel a pending or claimed request by deleting it. This sets the request status to 'cancelled'.",
        inputSchema: {
          type: "object",
          properties: {
            request_id: { type: "string" },
          },
          required: ["request_id"],
        },
      },
      {
        name: "add_request_feedback",
        description: "Attach structured feedback to a completed request to inform reviewers.",
        inputSchema: {
          type: "object",
          properties: {
            request_id: { type: "string" },
            feedback: { type: "object" },
          },
          required: ["request_id", "feedback"],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler("tools/call", async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result;

    switch (name) {
      case "list_loops": {
        const response = await hitlClient.getLoops();
        result = {
          message: response.msg,
          loops: response.data.loops,
          count: response.data.count,
        };
        break;
      }

      case "create_request": {
        const { loop_id, ...payload } = args;
        const response = await hitlClient.createRequest(loop_id, payload);
        result = {
          message: response.msg,
          data: response.data,
        };
        break;
      }

      case "list_requests": {
        const response = await hitlClient.listRequests(args);
        result = {
          message: response.msg,
          summary: {
            count: response.data.count,
            total: response.data.total,
            has_more: response.data.has_more,
          },
          requests: response.data.requests,
        };
        break;
      }

      case "get_request": {
        const response = await hitlClient.getRequest(args.request_id);
        result = {
          message: response.msg,
          data: response.data,
        };
        break;
      }

      case "update_request": {
        const response = await hitlClient.updateRequest(args.request_id, args.updates);
        result = {
          message: response.msg,
          data: response.data,
        };
        break;
      }

      case "cancel_request": {
        const response = await hitlClient.cancelRequest(args.request_id);
        result = {
          message: response.msg,
          data: response.data,
        };
        break;
      }

      case "add_request_feedback": {
        const response = await hitlClient.addRequestFeedback(args.request_id, { feedback: args.feedback });
        result = {
          message: response.msg,
          data: response.data,
        };
        break;
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    throw new Error(`Tool execution failed: ${error.message}`);
  }
});

// Helper to convert Zod to JSON Schema (simplified)
function zodToJsonSchema(schema) {
  // This is a simplified version - you may need a proper zod-to-json-schema library
  return {
    type: "object",
    properties: {},
    additionalProperties: true,
  };
}

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("HITL MCP stdio server started\n");
}

main().catch((error) => {
  process.stderr.write(`Fatal error: ${error.message}\n`);
  process.exit(1);
});
