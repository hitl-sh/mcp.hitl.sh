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

- **Authentication Flow**: Auth0 OAuth via the `withMcpAuth` wrapper and `verifyAuth0Token`
  - The per-user HITL key comes from the `https://mcp.hitl.sh/hitl_api_key` (or `hitl_api_key`) token claim
  - Falls back to the shared `HITL_API_KEY` env var when the user has no key
  - AsyncLocalStorage used to propagate auth context to tool handlers

- **Tool Registration**: Tools registered with `registerHitlTools` from `@hitl-sh/core/mcp-tools`
  (the same definitions the stdio server `@hitl-sh/mcp` uses; change tools in the hitl-sh/cli repo, not here):
  - Find and run: `list_workflows`, `get_workflow`, `get_workflow_input`, `run_workflow`, `get_execution`
    (with `wait`), `list_workflow_executions`, `watch_execution`, `retry_execution`
  - Build and manage: `create_workflow`, `update_workflow`, `delete_workflow`, `activate_workflow`,
    `pause_workflow`, `test_workflow`, `list_workflow_revisions`, `publish_workflow_revision`
  - Who reviews: `list_workflow_humans`, `invite_to_workflow`, `get_workflow_join_code`,
    `create_workflow_join_code`, `delete_workflow_join_code`, `rotate_workflow_join_code`, `validate_join_code`,
    `join_with_code`
  - Account: `check_api_key`, `signup_status`, `confirm_signup`, `resend_signup_email`

  HITL is workflows-only: the list is `WORKFLOW_TOOLS` in `@hitl-sh/core/api-catalog` (core 0.3.0+). There are no
  loop, request, image, session, org or webhook tools any more, though the API still serves those routes.
  Workflow routes are on dev.api.hitl.sh only for now; prod answers 404 until they ship there.
- **Server instructions**: both routes pass core's `HITL_SERVER_INSTRUCTIONS` (the list, input, run, wait path)
  and advertise `HITL_TOOL_NAMES` with `HITL_TOOL_DESCRIPTIONS` as capabilities.
- `/mcp-simple` ([app/mcp-simple/route.ts](app/mcp-simple/route.ts)) registers the same tools but takes the
  raw HITL API key as the Bearer token instead of Auth0 OAuth.

- **Configuration**:
  - `maxDuration: 90` (seconds, for Vercel Functions)
  - `disableSse: true` (uses Streamable HTTP only, no SSE)
  - OAuth protected resource metadata at `/.well-known/oauth-protected-resource`

### HITL Client (`@hitl-sh/core/client`)

`HitlClient` from the published `@hitl-sh/core` package:

- `new HitlClient(apiKey, { baseUrl, userAgent })`; the routes pass `HITL_API_BASE` as `baseUrl` when set (default `https://api.hitl.sh/v1`)
- Refuses to send the key to any host that is not hitl.sh or a subdomain; the routes pass `HITL_ALLOW_HOSTS` as `allowHosts`
- All methods return `HitlApiEnvelope<T>` with standard `{error, msg, data}` shape
- Throws `HitlApiError` (with status code and body) on HTTP errors

### Schema Validation

Each tool's Zod input schema is generated in `@hitl-sh/core/mcp-tools` from its catalog route: path arguments,
query parameters and body fields, flat (for example `run_workflow` takes `id`, `input`, `callback_url`, `live`).

### Path Aliases

TypeScript configured with `@/*` alias mapping to repository root:
```json
"paths": { "@/*": ["./*"] }
```

Example: `import { verifyAuth0Token } from "@/lib/auth0-verify"`

## Environment Variables

| Name | Required | Description |
|------|----------|-------------|
| `HITL_API_BASE` | No | Override HITL API root (defaults to `https://api.hitl.sh/v1`) |
| `HITL_ALLOW_HOSTS` | No | Comma-separated extra hosts allowed to receive the key (e.g. `localhost` for a local API); passed to `HitlClient` as `allowHosts` |

## Deployment Notes

- Enable [Fluid Compute](https://vercel.com/docs/functions/fluid-compute) for production MCP workloads
- Route handler sets `maxDuration` to 90 seconds for long-running tool calls
- MCP client must forward `Authorization` header when deployed
- Uses Streamable HTTP transport (SSE disabled)

## Testing

The [scripts/test-hitl-mcp.mjs](scripts/test-hitl-mcp.mjs) smoke test:
- Connects via Streamable HTTP transport
- Lists available tools
- Exercises `list_workflows`

[scripts/test-all-tools.mjs](scripts/test-all-tools.mjs) runs the workflow path: `check_api_key`, `list_workflows`,
`get_workflow`, `get_workflow_input`, `list_workflow_executions`, and with a workflow id also `run_workflow` and
`get_execution`.
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
