# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a production-ready Model Context Protocol (MCP) server built with Next.js that exposes HITL.sh (Human-in-the-Loop) API tools to remote MCP clients. The implementation follows Vercel's guidance for running MCP servers on Vercel Functions and uses Streamable HTTP transport.

**Core Technologies:**
- Next.js 15.2.4 (App Router)
- `mcp-handler` (npm package for MCP server implementation)
- TypeScript with strict mode
- pnpm as package manager
- Zod for schema validation

## Development Commands

```bash
# Install dependencies
pnpm install

# Start development server (runs on localhost:3000)
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start

# Test the MCP server (requires HITL API key)
node scripts/test-hitl-mcp.mjs http://localhost:3000/mcp sk_live_YOUR_KEY
# Or use environment variable:
HITL_API_KEY=sk_live_YOUR_KEY node scripts/test-hitl-mcp.mjs http://localhost:3000/mcp
```

## Architecture

### MCP Endpoint ([app/mcp/route.ts](app/mcp/route.ts))

The `/mcp` route is the main MCP server endpoint. It uses:

- **Authentication Flow**: Bearer token auth via `withMcpAuth` wrapper
  - Clients provide HITL API key as `Authorization: Bearer sk_live_...`
  - Keys are validated against `https://api.hitl.sh/v1/test` endpoint
  - Auth results cached for 5 minutes (`AUTH_CACHE_TTL_MS`)
  - AsyncLocalStorage used to propagate auth context to tool handlers

- **Tool Registration**: Eight tools registered via `createMcpHandler`:
  - `list_loops` - List all loops owned by the authenticated account
  - `create_request` - Create and broadcast a new request inside a loop
  - `list_requests` - List requests with optional filters
  - `get_request` - Retrieve full details for a single request
  - `update_request` - Patch mutable request fields
  - `delete_request` - Permanently delete a request
  - `cancel_request` - Cancel an in-flight request
  - `add_request_feedback` - Attach structured reviewer feedback

- **Configuration**:
  - `maxDuration: 90` (seconds, for Vercel Functions)
  - `disableSse: true` (uses Streamable HTTP only, no SSE)
  - OAuth protected resource metadata at `/.well-known/oauth-protected-resource`

### HITL Client ([lib/hitl-client.ts](lib/hitl-client.ts))

Lightweight typed HTTP client for HITL.sh API:

- Base URL defaults to `https://api.hitl.sh/v1` (override via `HITL_API_BASE` env var)
- All methods return `HitlApiEnvelope<T>` with standard `{error, msg, data}` shape
- Throws `HitlApiError` (with status code and body) on HTTP errors
- Methods correspond 1:1 with tool implementations in route.ts

**Key Methods:**
- `validateApiKey()` - Tests API key validity
- `getLoops()` - Fetches loop list
- `createRequest(loopId, payload)` - Creates request in loop
- `listRequests(params)` - Lists requests with filters (status, priority, loop_id, limit, offset, sort)
- `getRequest(requestId)` - Fetches single request
- `updateRequest(requestId, payload)` - Patches request fields
- `deleteRequest(requestId)` - Deletes request
- `cancelRequest(requestId, payload?)` - Cancels request with optional reason
- `addRequestFeedback(requestId, payload)` - Adds feedback to request

### Schema Validation

All tool inputs validated with Zod schemas before API calls:

- `createRequestInputSchema` - Has `.superRefine()` to enforce:
  - `timeout_seconds` required when `processing_type === "time-sensitive"`
  - `image_url` required when `type === "image"`
- `listRequestsInputSchema` - Validates filters and pagination params
- `updateRequestInputSchema` - Uses `.partial()` of create schema + requires at least one field
- `feedbackSchema` - Uses `.catchall(z.unknown())` to allow custom fields

### Path Aliases

TypeScript configured with `@/*` alias mapping to repository root:
```json
"paths": { "@/*": ["./*"] }
```

Example: `import { createHitlClient } from "@/lib/hitl-client"`

## Environment Variables

| Name | Required | Description |
|------|----------|-------------|
| `HITL_API_BASE` | No | Override HITL API root (defaults to `https://api.hitl.sh/v1`) |

## Deployment Notes

- Enable [Fluid Compute](https://vercel.com/docs/functions/fluid-compute) for production MCP workloads
- Route handler sets `maxDuration` to 90 seconds for long-running tool calls
- MCP client must forward `Authorization` header when deployed
- Uses Streamable HTTP transport (SSE disabled)

## Testing

The [scripts/test-hitl-mcp.mjs](scripts/test-hitl-mcp.mjs) smoke test:
- Connects via Streamable HTTP transport
- Lists available tools
- Exercises `list_loops` and `list_requests` with sample params
- Requires `@modelcontextprotocol/sdk` as a peer dependency

## API Surface

All tools return JSON wrapped in MCP content blocks via `formatContent()`:
```typescript
{
  content: [
    {
      type: "text",
      text: JSON.stringify(payload, null, 2)
    }
  ]
}
```

Errors normalized via `normalizeError()` to ensure consistent Error objects with status codes for HitlApiError instances.

## References

- HITL.sh API Reference: https://docs.hitl.sh/llms.txt
- Vercel MCP Guide: https://github.com/vercel-labs/mcp-on-vercel
- mcp-handler package: https://www.npmjs.com/package/mcp-handler
