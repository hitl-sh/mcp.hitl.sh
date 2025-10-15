# HITL.sh MCP Server (Next.js)

Production-ready Model Context Protocol server that exposes curated HITL.sh tools for remote MCP clients. The implementation follows Vercel's guidance for running MCP servers on Vercel Functions ([vercel-labs/mcp-on-vercel](https://github.com/vercel-labs/mcp-on-vercel/blob/main/README.md)) and the official HITL.sh API reference ([docs.hitl.sh](https://docs.hitl.sh/llms.txt)).

## Features

- ✅ Streamable HTTP MCP endpoint at `/mcp` powered by [`mcp-handler`](https://www.npmjs.com/package/mcp-handler)
- 🔐 API key enforcement via the MCP authorization wrapper (`withMcpAuth`)
- 🛠️ Eight HITL.sh tools that mirror the workflows in `PLAN.txt`
- 🧰 Shared `lib/hitl-client.ts` with typed helpers and graceful error propagation
- 🧪 Minimal smoke test script for quick end-to-end verification

## Configuration

Environment variables:

| Name | Required | Description |
| ---- | -------- | ----------- |
| `HITL_API_BASE` | No | Override the HITL API root (defaults to `https://api.hitl.sh/v1`). |

Authentication:

- Clients must provide their HITL API key as a Bearer token (`Authorization: Bearer sk_live_...`).
- The server validates and caches credentials using `GET https://api.hitl.sh/v1/test` before allowing tool invocations.
- OAuth protected resource metadata is exposed at `/.well-known/oauth-protected-resource` for compliant clients.

## Available Tools

| Tool name | Action |
| --------- | ------ |
| `list_loops` | List all loops owned by the authenticated account. |
| `create_request` | Create and broadcast a new request inside a loop. |
| `list_requests` | List requests with optional filters (`status`, `priority`, `loop_id`, etc.). |
| `get_request` | Retrieve full details for a single request. |
| `update_request` | Patch mutable request fields (text, priority, response config, …). |
| `delete_request` | Permanently delete a request owned by the API key. |
| `cancel_request` | Cancel an in-flight request via `/cancel`. |
| `add_request_feedback` | Attach structured reviewer feedback. |

All tools return JSON payloads wrapped in MCP content for easy inspection.

## Local Development

```sh
pnpm install
pnpm dev
```

In another terminal, run the smoke test (replace the API key or export `HITL_API_KEY`):

```sh
node scripts/test-hitl-mcp.mjs http://localhost:3000/mcp sk_live_your_key
```

The script connects via Streamable HTTP, lists tools, and exercises the `list_loops` and `list_requests` endpoints. Supply additional tool arguments by editing the script or using your preferred MCP client.

## Deployment Notes

- Enable [Fluid Compute](https://vercel.com/docs/functions/fluid-compute) for production-grade MCP workloads.
- `app/mcp/route.ts` sets `maxDuration` to 90 seconds and disables SSE (Streamable HTTP only).
- The implementation relies on headers for auth; ensure your MCP client forwards `Authorization` when deployed.

## References

- Vercel Labs, **Run an MCP Server on Vercel**, <https://github.com/vercel-labs/mcp-on-vercel/blob/main/README.md>
- HITL.sh API Reference, <https://docs.hitl.sh/llms.txt> (loop, request, and feedback endpoints)
