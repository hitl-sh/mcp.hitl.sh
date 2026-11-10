#!/usr/bin/env node

/**
 * Smoke test for the HITL MCP server's workflow tools.
 *
 * Usage:
 *    node scripts/test-all-tools.mjs http://localhost:3000/mcp-simple YOUR_HITL_API_KEY [WORKFLOW_ID]
 *
 * Alternatively set HITL_API_KEY in the environment and omit the second argument. With a workflow id it
 * also starts a run of that (active) workflow and reads it back; a human then answers it in the app.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const [, , serverUrlArg, apiKeyArg, workflowId] = process.argv;
const apiKey = apiKeyArg ?? process.env.HITL_API_KEY;
if (!serverUrlArg || !apiKey) {
  console.error("Usage: node scripts/test-all-tools.mjs <server-url> [api-key] [workflow-id]");
  process.exit(1);
}

const client = new Client({ name: "hitl-mcp-workflow-test", version: "0.2.0" });
await client.connect(
  new StreamableHTTPClientTransport(new URL(serverUrlArg), { requestInit: { headers: { Authorization: `Bearer ${apiKey}` } } }),
);

const call = async (name, args = {}) => {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) throw new Error(`${name}: ${JSON.stringify(result.content)}`);
  const body = JSON.parse(result.content[0].text);
  console.log(`✅ ${name}`);
  return body.data;
};

try {
  const { tools } = await client.listTools();
  console.log(`${tools.length} tools: ${tools.map((t) => t.name).join(", ")}`);
  await call("check_api_key");
  const { workflows = [] } = (await call("list_workflows")) ?? {};
  for (const w of workflows) console.log(`   ${w.id}  ${w.name}  ${w.status}`);
  const id = workflowId ?? workflows[0]?.id;
  if (id) {
    await call("get_workflow", { id });
    const input = await call("get_workflow_input", { id });
    console.log(`   input fields: ${input.fields.map((f) => f.path).join(", ") || "(none)"}`);
    await call("list_workflow_executions", { id, limit: 3 });
  }
  if (workflowId) {
    const run = await call("run_workflow", { id: workflowId, input: {} });
    const execution = await call("get_execution", { id: run.execution_id ?? run.id });
    console.log(`   run ${execution.id}: ${execution.status}`);
  }
} catch (error) {
  console.error("❌", error.message);
  process.exitCode = 1;
} finally {
  await client.close();
}
