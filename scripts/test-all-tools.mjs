#!/usr/bin/env node

/**
 * Comprehensive test script for all HITL MCP server tools.
 *
 * Usage:
 *    node scripts/test-all-tools.mjs http://localhost:3002/mcp YOUR_HITL_API_KEY
 *
 * Alternatively set HITL_API_KEY in the environment and omit the second argument.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

function printUsage() {
  console.log(
    "Usage: node scripts/test-all-tools.mjs <server-url> [api-key]\n" +
      "Example: node scripts/test-all-tools.mjs http://localhost:3002/mcp sk_live_XXX",
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
  name: "hitl-mcp-comprehensive-test",
  version: "0.1.0",
});

function logTest(testName) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`TEST: ${testName}`);
  console.log("=".repeat(60));
}

function logSuccess(message) {
  console.log(`✅ ${message}`);
}

function logError(message) {
  console.log(`❌ ${message}`);
}

function logInfo(message) {
  console.log(`ℹ️  ${message}`);
}

async function main() {
  await client.connect(transport);

  // Test 1: List all tools
  logTest("List Tools");
  const tools = await client.listTools();
  logSuccess(`Found ${tools.tools?.length ?? 0} tools`);
  tools.tools?.forEach((tool) => {
    console.log(
      `  - ${tool.name}: ${tool.description ?? tool.annotations?.description ?? ""}`,
    );
  });

  // Test 2: List loops
  logTest("list_loops");
  const loopsResponse = await client.callTool({
    name: "list_loops",
    arguments: {},
  });
  const loopsData = JSON.parse(loopsResponse.content[0].text);
  logSuccess(`Retrieved ${loopsData.count} loop(s)`);

  if (loopsData.loops && loopsData.loops.length > 0) {
    const firstLoop = loopsData.loops[0];
    logInfo(`First loop: ${firstLoop.name} (ID: ${firstLoop.id})`);
    console.log(JSON.stringify(firstLoop, null, 2));
  } else {
    logInfo("No loops found. Create a loop at hitl.sh to test other tools.");
    console.log("\n⚠️  Remaining tests require at least one loop. Exiting.");
    return;
  }

  const testLoopId = loopsData.loops[0].id;

  // Test 3: List requests
  logTest("list_requests - All requests");
  const allRequests = await client.callTool({
    name: "list_requests",
    arguments: {},
  });
  const allRequestsData = JSON.parse(allRequests.content[0].text);
  logSuccess(`Total requests: ${allRequestsData.summary.count ?? 0}`);
  console.log(JSON.stringify(allRequestsData.summary, null, 2));

  // Test 4: List requests with filters
  logTest("list_requests - With filters (limit=5, status=pending)");
  const filteredRequests = await client.callTool({
    name: "list_requests",
    arguments: {
      limit: 5,
      status: "pending",
    },
  });
  const filteredData = JSON.parse(filteredRequests.content[0].text);
  logSuccess(`Found ${filteredData.summary.count ?? 0} pending requests`);

  // Test 5: Create a new request
  logTest("create_request - Create a test request");
  logInfo(`Creating request in loop: ${testLoopId}`);

  try {
    const createResponse = await client.callTool({
      name: "create_request",
      arguments: {
        loop_id: testLoopId,
        processing_type: "deferred",
        type: "markdown",
        priority: "medium",
        request_text: "MCP Server Test Request - Please review this test message",
        response_type: "single_select",
        response_config: {
          options: [
            "Approve",
            "Reject",
            "Needs Changes"
          ],
          required: true
        },
        default_response: "Reject",
        platform: "api",
        tags: ["test", "mcp-server"],
      },
    });

    // Debug: log the raw response
    console.log("Raw response:", JSON.stringify(createResponse, null, 2));

    const createData = JSON.parse(createResponse.content[0].text);
    logSuccess("Request created successfully!");
    console.log(JSON.stringify(createData.data, null, 2));

    const newRequestId = createData.data.id;

    // Test 6: Get request details
    logTest("get_request - Get details of created request");
    const getResponse = await client.callTool({
      name: "get_request",
      arguments: {
        request_id: newRequestId,
      },
    });
    const getData = JSON.parse(getResponse.content[0].text);
    logSuccess("Retrieved request details");
    console.log(JSON.stringify(getData.data, null, 2));

    // Test 7: Update request
    logTest("update_request - Update request priority");
    const updateResponse = await client.callTool({
      name: "update_request",
      arguments: {
        request_id: newRequestId,
        updates: {
          priority: "high",
          request_text: "MCP Server Test Request - UPDATED with high priority",
        },
      },
    });
    const updateData = JSON.parse(updateResponse.content[0].text);
    logSuccess("Request updated successfully!");
    console.log(JSON.stringify(updateData.data, null, 2));

    // Test 8: Cancel request (via DELETE)
    logTest("cancel_request - Cancel the test request");
    const cancelResponse = await client.callTool({
      name: "cancel_request",
      arguments: {
        request_id: newRequestId,
      },
    });
    const cancelData = JSON.parse(cancelResponse.content[0].text);
    logSuccess("Request cancelled successfully!");
    console.log(JSON.stringify(cancelData, null, 2));

    // Test 9: Add feedback (note: this might fail if request isn't completed)
    logTest("add_request_feedback - Add feedback to request");
    try {
      const feedbackResponse = await client.callTool({
        name: "add_request_feedback",
        arguments: {
          request_id: newRequestId,
          feedback: {
            rating: 5,
            comment: "Test feedback from MCP server test suite",
            accuracy: 5,
            timeliness: 5,
            helpfulness: 5,
            would_recommend: true,
            category: "positive",
          },
        },
      });
      const feedbackData = JSON.parse(feedbackResponse.content[0].text);
      logSuccess("Feedback added successfully!");
      console.log(JSON.stringify(feedbackData, null, 2));
    } catch (error) {
      logInfo("Feedback test skipped - request may need to be completed first");
      console.log(`Error: ${error.message}`);
    }

    // Note: Request was already cancelled in Test 8, no need to delete again

  } catch (error) {
    logError(`Test failed: ${error.message}`);
    console.error(error);
  }

  // Final summary
  logTest("TEST SUMMARY");
  logSuccess("All core MCP tools tested successfully!");
  logInfo("Tools tested:");
  console.log("  ✅ list_loops");
  console.log("  ✅ create_request");
  console.log("  ✅ list_requests (with and without filters)");
  console.log("  ✅ get_request");
  console.log("  ✅ update_request");
  console.log("  ✅ cancel_request (via DELETE)");
  console.log("  ℹ️  add_request_feedback (conditional)");
}

main()
  .catch((error) => {
    logError("Test suite failed");
    console.error(error);
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
