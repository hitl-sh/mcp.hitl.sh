#!/usr/bin/env node

/**
 * Standalone stdio MCP server for Claude Desktop
 * Uses high-level MCP server API
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_KEY = process.env.HITL_API_KEY;
const API_BASE = process.env.HITL_API_BASE || "https://api.hitl.sh/v1";

if (!API_KEY) {
  console.error("Error: HITL_API_KEY environment variable is required");
  process.exit(1);
}

// HITL API client
class HitlClient {
  constructor(apiKey, baseUrl) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  }

  async request(path, options = {}) {
    const url = new URL(path, this.baseUrl);
    const headers = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: "application/json",
      ...(options.body && { "Content-Type": "application/json" }),
      "User-Agent": "hitl-mcp-stdio-server/0.1.0",
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    const contentType = response.headers.get("content-type");
    let body;

    if (contentType?.includes("application/json")) {
      body = await response.json();
    } else {
      const text = await response.text();
      body = text ? { raw: text } : undefined;
    }

    if (!response.ok) {
      const message = body?.msg || `API request failed with status ${response.status}`;
      throw new Error(message);
    }

    return body;
  }

  async getLoops() {
    return this.request("api/loops", { method: "GET" });
  }

  async createRequest(loopId, payload) {
    return this.request(`api/loops/${loopId}/requests`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async listRequests(params = {}) {
    const search = new URLSearchParams();
    if (params.status) search.set("status", params.status);
    if (params.priority) search.set("priority", params.priority);
    if (params.loop_id) search.set("loop_id", params.loop_id);
    if (params.limit !== undefined) search.set("limit", String(params.limit));
    if (params.offset !== undefined) search.set("offset", String(params.offset));
    if (params.sort) search.set("sort", params.sort);

    const path = search.size > 0 ? `api/requests?${search.toString()}` : "api/requests";
    return this.request(path, { method: "GET" });
  }

  async getRequest(requestId) {
    return this.request(`api/requests/${requestId}`, { method: "GET" });
  }

  async updateRequest(requestId, payload) {
    return this.request(`api/requests/${requestId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  }

  async cancelRequest(requestId) {
    return this.request(`api/requests/${requestId}`, { method: "DELETE" });
  }

  async addRequestFeedback(requestId, payload) {
    return this.request(`api/requests/${requestId}/feedback`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }
}

// Create HITL client
const hitlClient = new HitlClient(API_KEY, API_BASE);

// Create MCP server using high-level API
const mcpServer = new McpServer({
  name: "hitl-mcp-server",
  version: "0.1.0",
});

// Register list_loops tool
mcpServer.tool(
  "list_loops",
  "Retrieve all loops owned by the authenticated HITL.sh account.",
  {},
  async () => {
    const response = await hitlClient.getLoops();
    if (response.error) {
      throw new Error(response.msg || "Failed to list loops");
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            message: response.msg,
            loops: response.data.loops,
            count: response.data.count,
          }, null, 2),
        },
      ],
    };
  }
);

// Register create_request tool
mcpServer.tool(
  "create_request",
  "Create a new review request within a specific loop and broadcast it to reviewers.",
  {
    loop_id: z.string().describe("Loop ID"),
    processing_type: z.enum(["time-sensitive", "deferred"]).describe("Processing type"),
    type: z.enum(["markdown", "image"]).describe("Request type"),
    priority: z.enum(["low", "medium", "high", "critical"]).describe("Priority"),
    request_text: z.string().describe("Request text"),
    timeout_seconds: z.number().optional().describe("Timeout in seconds (for time-sensitive)"),
    response_type: z.enum(["single_select", "multi_select", "rating", "text", "number"]).describe("Response type"),
    response_config: z.record(z.unknown()).describe("Response configuration"),
    default_response: z.unknown().describe("Default response if timeout"),
    platform: z.string().optional().describe("Platform name"),
    image_url: z.string().optional().describe("Image URL (for image type)"),
    context: z.record(z.unknown()).optional().describe("Additional context"),
    callback_url: z.string().optional().describe("Callback URL"),
    tags: z.array(z.string()).optional().describe("Tags"),
  },
  async (args) => {
    try {
      console.error("create_request called with args:", JSON.stringify(args, null, 2));

      const { loop_id, ...payload } = args;

      // Validate required fields
      if (!loop_id) {
        throw new Error("loop_id is required");
      }
      if (!payload.processing_type) {
        throw new Error("processing_type is required");
      }
      if (!payload.type) {
        throw new Error("type is required");
      }
      if (!payload.priority) {
        throw new Error("priority is required");
      }
      if (!payload.request_text) {
        throw new Error("request_text is required");
      }
      if (!payload.response_type) {
        throw new Error("response_type is required");
      }
      if (!payload.response_config) {
        throw new Error("response_config is required");
      }
      if (payload.default_response === undefined) {
        throw new Error("default_response is required");
      }

      // Set defaults
      if (!payload.platform) {
        payload.platform = "api";
      }

      console.error("Sending to HITL API - loop_id:", loop_id);
      console.error("Payload:", JSON.stringify(payload, null, 2));

      const response = await hitlClient.createRequest(loop_id, payload);

      console.error("HITL API response:", JSON.stringify(response, null, 2));

      if (response.error) {
        throw new Error(response.msg || "Failed to create request");
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              message: response.msg,
              data: response.data,
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      console.error("create_request error:", error);
      throw error;
    }
  }
);

// Register list_requests tool
mcpServer.tool(
  "list_requests",
  "List requests created by the authenticated API key with optional filters.",
  {
    status: z.enum(["pending", "claimed", "completed", "timeout", "cancelled"]).optional().describe("Filter by status"),
    priority: z.enum(["low", "medium", "high", "critical"]).optional().describe("Filter by priority"),
    loop_id: z.string().optional().describe("Filter by loop ID"),
    limit: z.number().optional().describe("Limit results"),
    offset: z.number().optional().describe("Offset for pagination"),
    sort: z.enum(["created_at_desc", "created_at_asc", "priority_desc", "status_asc"]).optional().describe("Sort order"),
  },
  async (args) => {
    const response = await hitlClient.listRequests(args);
    if (response.error) {
      throw new Error(response.msg || "Failed to list requests");
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            message: response.msg,
            summary: {
              count: response.data.count,
              total: response.data.total,
              has_more: response.data.has_more,
            },
            requests: response.data.requests,
          }, null, 2),
        },
      ],
    };
  }
);

// Register get_request tool
mcpServer.tool(
  "get_request",
  "Fetch detailed information about a single request by its identifier.",
  {
    request_id: z.string().describe("Request ID"),
  },
  async (args) => {
    const response = await hitlClient.getRequest(args.request_id);
    if (response.error) {
      throw new Error(response.msg || "Failed to get request");
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            message: response.msg,
            data: response.data,
          }, null, 2),
        },
      ],
    };
  }
);

// Register update_request tool
mcpServer.tool(
  "update_request",
  "Update mutable fields of a request, such as text, priority, or configuration.",
  {
    request_id: z.string().describe("Request ID"),
    updates: z.record(z.unknown()).describe("Fields to update"),
  },
  async (args) => {
    const response = await hitlClient.updateRequest(args.request_id, args.updates);
    if (response.error) {
      throw new Error(response.msg || "Failed to update request");
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            message: response.msg,
            data: response.data,
          }, null, 2),
        },
      ],
    };
  }
);

// Register cancel_request tool
mcpServer.tool(
  "cancel_request",
  "Cancel a pending or claimed request by deleting it. This sets the request status to 'cancelled'.",
  {
    request_id: z.string().describe("Request ID"),
  },
  async (args) => {
    const response = await hitlClient.cancelRequest(args.request_id);
    if (response.error) {
      throw new Error(response.msg || "Failed to cancel request");
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            message: response.msg,
            data: response.data,
          }, null, 2),
        },
      ],
    };
  }
);

// Register add_request_feedback tool
mcpServer.tool(
  "add_request_feedback",
  "Attach structured feedback to a completed request to inform reviewers.",
  {
    request_id: z.string().describe("Request ID"),
    feedback: z.record(z.unknown()).describe("Feedback object"),
  },
  async (args) => {
    const response = await hitlClient.addRequestFeedback(args.request_id, { feedback: args.feedback });
    if (response.error) {
      throw new Error(response.msg || "Failed to add feedback");
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            message: response.msg,
            data: response.data,
          }, null, 2),
        },
      ],
    };
  }
);

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  console.error("HITL MCP stdio server started successfully");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
