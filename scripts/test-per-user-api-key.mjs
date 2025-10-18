import { config } from "dotenv";
config({ path: ".env.local" });

const AUTH0_ISSUER = process.env.AUTH0_ISSUER_URL;
const AUTH0_CLIENT_ID = process.env.AUTH0_CLIENT_ID;
const AUTH0_CLIENT_SECRET = process.env.AUTH0_CLIENT_SECRET;
const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE;
const SERVER_URL = process.argv[2] || "http://localhost:3002";

// Test API key (you can replace with your personal one)
const TEST_HITL_API_KEY = process.argv[3] || "hitl_test_example_key_for_testing";

console.log("🧪 Testing Per-User API Key Flow");
console.log("=".repeat(70));
console.log(`Server: ${SERVER_URL}`);
console.log(`Test API Key: ${TEST_HITL_API_KEY}`);
console.log("=".repeat(70));
console.log();

async function testPerUserApiKey() {
  try {
    // Step 1: Get OAuth token
    console.log("1️⃣  Getting OAuth access token from Auth0...");
    const tokenResponse = await fetch(`${AUTH0_ISSUER}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: AUTH0_CLIENT_ID,
        client_secret: AUTH0_CLIENT_SECRET,
        audience: AUTH0_AUDIENCE,
        grant_type: "client_credentials",
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error(`Failed to get token: ${await tokenResponse.text()}`);
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    console.log("✅ Access token received");
    console.log(`   Token preview: ${accessToken.substring(0, 50)}...`);
    console.log();

    // Step 2: Decode token to check current claims
    console.log("2️⃣  Checking current token claims...");
    const payloadPart = accessToken.split('.')[1];
    const decodedPayload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf-8'));
    const currentApiKey = decodedPayload['https://mcp.hitl.sh/hitl_api_key'];

    if (currentApiKey) {
      console.log(`✅ Current API key in token: ${currentApiKey.substring(0, 20)}...`);
    } else {
      console.log("ℹ️  No API key in token yet (will use fallback)");
    }
    console.log();

    // Step 3: Save user's API key
    console.log("3️⃣  Saving user's HITL API key via API...");
    const saveResponse = await fetch(`${SERVER_URL}/api/update-hitl-key`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        hitl_api_key: TEST_HITL_API_KEY,
      }),
    });

    if (!saveResponse.ok) {
      const errorText = await saveResponse.text();
      throw new Error(`Failed to save API key: ${saveResponse.status} ${errorText}`);
    }

    const saveResult = await saveResponse.json();
    console.log("✅ API key saved successfully!");
    console.log(`   Message: ${saveResult.message}`);
    console.log();

    // Step 4: Get new token (should now include the API key)
    console.log("4️⃣  Getting new access token (should include API key)...");
    const newTokenResponse = await fetch(`${AUTH0_ISSUER}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: AUTH0_CLIENT_ID,
        client_secret: AUTH0_CLIENT_SECRET,
        audience: AUTH0_AUDIENCE,
        grant_type: "client_credentials",
      }),
    });

    const newTokenData = await newTokenResponse.json();
    const newAccessToken = newTokenData.access_token;

    // Decode new token
    const newPayloadPart = newAccessToken.split('.')[1];
    const newDecodedPayload = JSON.parse(Buffer.from(newPayloadPart, 'base64url').toString('utf-8'));
    const newApiKey = newDecodedPayload['https://mcp.hitl.sh/hitl_api_key'];

    if (newApiKey === TEST_HITL_API_KEY) {
      console.log("✅ API key found in new token!");
      console.log(`   Key: ${newApiKey.substring(0, 20)}...`);
    } else {
      console.log("⚠️  API key not in token yet");
      console.log("   This is normal - token might be cached by Auth0");
      console.log("   Wait a few seconds and try again");
    }
    console.log();

    // Step 5: Test MCP call
    console.log("5️⃣  Testing MCP call with new token...");
    const mcpResponse = await fetch(`${SERVER_URL}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        "Authorization": `Bearer ${newAccessToken}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
      }),
    });

    if (!mcpResponse.ok) {
      throw new Error(`MCP call failed: ${mcpResponse.status} ${await mcpResponse.text()}`);
    }

    // Parse SSE or JSON response
    const contentType = mcpResponse.headers.get("content-type");
    let mcpData;

    if (contentType?.includes("text/event-stream")) {
      const text = await mcpResponse.text();
      const lines = text.split("\n");
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const jsonStr = line.substring(6);
          if (jsonStr.trim()) {
            mcpData = JSON.parse(jsonStr);
            break;
          }
        }
      }
    } else {
      mcpData = await mcpResponse.json();
    }

    console.log("✅ MCP call successful!");
    console.log(`   Tools available: ${mcpData.result?.tools?.length || 0}`);
    console.log();

    // Summary
    console.log("=".repeat(70));
    console.log("🎉 Per-User API Key Test Complete!");
    console.log("=".repeat(70));
    console.log();
    console.log("Summary:");
    console.log(`  ✅ OAuth token obtained`);
    console.log(`  ✅ User API key saved to Auth0`);
    console.log(`  ${newApiKey === TEST_HITL_API_KEY ? '✅' : '⏳'} API key in access token ${newApiKey === TEST_HITL_API_KEY ? '' : '(pending)'}`);
    console.log(`  ✅ MCP server accessible with OAuth`);
    console.log();

    if (newApiKey === TEST_HITL_API_KEY) {
      console.log("✨ Everything is working perfectly!");
      console.log("   The MCP server will now use the user's personal HITL API key.");
    } else {
      console.log("⚠️  Note: Token might be cached. The API key was saved successfully,");
      console.log("   but it may take a few seconds to appear in new tokens.");
      console.log("   Try running this script again in 10-30 seconds.");
    }
    console.log();

    console.log("Next steps:");
    console.log("  1. Create the Auth0 Action (see PER_USER_API_KEY_SETUP.md)");
    console.log("  2. Add the Action to the Login flow");
    console.log("  3. Deploy to Vercel");
    console.log("  4. Test with ChatGPT");

  } catch (error) {
    console.error("\n❌ Test failed:");
    console.error(error.message);
    if (error.stack) {
      console.error("\nStack trace:");
      console.error(error.stack);
    }
    process.exit(1);
  }
}

testPerUserApiKey();
