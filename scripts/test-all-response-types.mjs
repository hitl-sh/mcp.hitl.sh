#!/usr/bin/env node

/**
 * Test script that demonstrates all request types and response types.
 *
 * Usage:
 *    node scripts/test-all-response-types.mjs http://localhost:3002/mcp YOUR_HITL_API_KEY
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

function printUsage() {
  console.log(
    "Usage: node scripts/test-all-response-types.mjs <server-url> [api-key]\n" +
      "Example: node scripts/test-all-response-types.mjs http://localhost:3002/mcp hitl_live_XXX",
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
  name: "hitl-mcp-response-types-test",
  version: "0.1.0",
});

function logTest(testName) {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`TEST: ${testName}`);
  console.log("=".repeat(70));
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

const createdRequestIds = [];

async function createAndTestRequest(loopId, testName, requestPayload) {
  logTest(testName);

  try {
    const createResponse = await client.callTool({
      name: "create_request",
      arguments: {
        loop_id: loopId,
        ...requestPayload,
      },
    });

    if (createResponse.isError) {
      logError(`Failed: ${createResponse.content[0].text}`);
      return null;
    }

    const createData = JSON.parse(createResponse.content[0].text);
    logSuccess("Request created successfully!");
    console.log(JSON.stringify(createData.data, null, 2));

    const requestId = createData.data.id;
    createdRequestIds.push(requestId);

    return requestId;
  } catch (error) {
    logError(`Failed: ${error.message}`);
    return null;
  }
}

async function main() {
  await client.connect(transport);

  // Get loops
  logTest("Getting loops");
  const loopsResponse = await client.callTool({
    name: "list_loops",
    arguments: {},
  });
  const loopsData = JSON.parse(loopsResponse.content[0].text);

  if (!loopsData.loops || loopsData.loops.length === 0) {
    logError("No loops found. Create a loop at hitl.sh first.");
    return;
  }

  const testLoopId = loopsData.loops[0].id;
  logSuccess(`Using loop: ${loopsData.loops[0].name} (${testLoopId})`);

  // Test 1: Single Select (Markdown)
  await createAndTestRequest(
    testLoopId,
    "Single Select - Markdown",
    {
      processing_type: "deferred",
      type: "markdown",
      priority: "high",
      request_text: "Please categorize this customer support ticket.",
      context: {
        ticket_id: "TICKET-12345",
        customer_email: "user@example.com",
        subject: "Login issues",
      },
      response_type: "single_select",
      response_config: {
        options: [
          "Technical Issue",
          "Account Problem",
          "Billing Question",
          "Feature Request",
          "Other",
        ],
        required: true,
      },
      default_response: "Other",
      platform: "api",
    }
  );

  // Test 2: Multi Select (Image)
  await createAndTestRequest(
    testLoopId,
    "Multi Select - Image",
    {
      processing_type: "time-sensitive",
      type: "image",
      priority: "critical",
      request_text: "What objects do you see in this image? Select all that apply.",
      image_url: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4",
      timeout_seconds: 900,
      response_type: "multi_select",
      response_config: {
        options: [
          "Person",
          "Car",
          "Building",
          "Tree",
          "Animal",
          "Traffic Light",
          "Road Sign",
        ],
        max_selections: 3,
        required: true,
      },
      default_response: ["Tree"],
      platform: "api",
    }
  );

  // Test 3: Rating (Markdown)
  await createAndTestRequest(
    testLoopId,
    "Rating - Markdown",
    {
      processing_type: "deferred",
      type: "markdown",
      priority: "low",
      request_text: "Please rate the quality of this AI-generated content on a scale of 1-5.",
      context: {
        content_id: "ai_gen_123",
        content_type: "blog_post",
        generated_by: "gpt-4",
      },
      response_type: "rating",
      response_config: {
        scale_max: 5,
      },
      default_response: 3,
      platform: "api",
    }
  );

  // Test 4: Text (Markdown)
  await createAndTestRequest(
    testLoopId,
    "Text - Markdown",
    {
      processing_type: "time-sensitive",
      type: "markdown",
      priority: "medium",
      request_text: "Please provide a summary of this article in 2-3 sentences.",
      context: {
        article_url: "https://example.com/article",
        word_limit: 50,
      },
      timeout_seconds: 1800,
      response_type: "text",
      response_config: {
        min_length: 20,
        max_length: 500,
      },
      default_response: "No summary provided",
      platform: "api",
    }
  );

  // Test 5: Number (Markdown)
  await createAndTestRequest(
    testLoopId,
    "Number - Markdown",
    {
      processing_type: "time-sensitive",
      type: "markdown",
      priority: "medium",
      request_text: "How many people are visible in this crowd photo?",
      context: {
        event_name: "Tech Conference 2025",
        photo_location: "Main auditorium",
        timestamp: "2025-01-15T14:30:00Z",
      },
      timeout_seconds: 3600,
      response_type: "number",
      response_config: {
        min_value: 1,
        max_value: 1000,
        allow_negative: false,
        decimal_places: 2,
      },
      default_response: 105.5,
      platform: "api",
    }
  );

  // Cleanup: Cancel all created requests
  logTest("Cleanup - Cancelling test requests");
  for (const requestId of createdRequestIds) {
    try {
      await client.callTool({
        name: "cancel_request",
        arguments: { request_id: requestId },
      });
      logSuccess(`Cancelled request: ${requestId}`);
    } catch (error) {
      logError(`Failed to cancel ${requestId}: ${error.message}`);
    }
  }

  // Summary
  logTest("TEST SUMMARY");
  logSuccess(`Created and tested ${createdRequestIds.length} request types`);
  console.log("\n✅ All response types tested:");
  console.log("  • single_select (markdown)");
  console.log("  • multi_select (image)");
  console.log("  • rating (markdown)");
  console.log("  • text (markdown)");
  console.log("  • number (markdown)");
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
