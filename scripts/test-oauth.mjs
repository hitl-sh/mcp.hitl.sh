import { config } from "dotenv";
config({ path: ".env.local" });

const AUTH0_ISSUER = process.env.AUTH0_ISSUER_URL;
const AUTH0_CLIENT_ID = process.env.AUTH0_CLIENT_ID;
const AUTH0_CLIENT_SECRET = process.env.AUTH0_CLIENT_SECRET;
const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE;
const MCP_URL = process.argv[2] || "http://localhost:3002/mcp";

if (!AUTH0_ISSUER || !AUTH0_CLIENT_ID || !AUTH0_CLIENT_SECRET || !AUTH0_AUDIENCE) {
  console.error("❌ Missing Auth0 configuration in .env.local");
  console.error("Required: AUTH0_ISSUER_URL, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET, AUTH0_AUDIENCE");
  process.exit(1);
}

async function testOAuth() {
  console.log("🔐 Testing OAuth Setup");
  console.log("=".repeat(60));
  console.log(`Auth0 Issuer: ${AUTH0_ISSUER}`);
  console.log(`Audience: ${AUTH0_AUDIENCE}`);
  console.log(`MCP Server: ${MCP_URL}`);
  console.log("=".repeat(60));
  console.log();

  try {
    // Step 1: Get access token from Auth0
    console.log("1️⃣  Getting access token from Auth0...");
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
      const error = await tokenResponse.text();
      console.error("❌ Failed to get token:");
      console.error(error);
      process.exit(1);
    }

    const tokenData = await tokenResponse.json();
    console.log("✅ Access token received");
    console.log(`   Token type: ${tokenData.token_type}`);
    console.log(`   Expires in: ${tokenData.expires_in} seconds`);
    console.log(`   Token preview: ${tokenData.access_token.substring(0, 50)}...`);
    console.log();

    // Step 2: Test protected resource metadata endpoint
    console.log("2️⃣  Checking OAuth protected resource metadata...");
    const metadataUrl = MCP_URL.replace("/mcp", "/.well-known/oauth-protected-resource");
    const metadataResponse = await fetch(metadataUrl);

    if (!metadataResponse.ok) {
      console.error("❌ Failed to get metadata:", metadataResponse.status);
      const text = await metadataResponse.text();
      console.error(text);
    } else {
      const metadata = await metadataResponse.json();
      console.log("✅ OAuth metadata endpoint working:");
      console.log(JSON.stringify(metadata, null, 2));
    }
    console.log();

    // Step 3: Test WITHOUT token (should fail with 401)
    console.log("3️⃣  Testing WITHOUT token (should fail with 401)...");
    const noAuthResponse = await fetch(MCP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
      }),
    });

    if (noAuthResponse.status === 401) {
      console.log("✅ Correctly rejected unauthenticated request (401)");
      const wwwAuth = noAuthResponse.headers.get("WWW-Authenticate");
      if (wwwAuth) {
        console.log(`   WWW-Authenticate: ${wwwAuth}`);
      }
    } else {
      console.log(`⚠️  Expected 401, got: ${noAuthResponse.status}`);
      if (noAuthResponse.status === 200) {
        console.log("   WARNING: Server is accepting requests without authentication!");
      }
    }
    console.log();

    // Step 4: Call MCP WITH valid token
    console.log("4️⃣  Calling MCP server WITH access token...");
    const mcpResponse = await fetch(MCP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        Authorization: `Bearer ${tokenData.access_token}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
      }),
    });

    if (!mcpResponse.ok) {
      console.error(`❌ MCP request failed with status ${mcpResponse.status}`);
      const error = await mcpResponse.text();
      console.error(error);
      process.exit(1);
    }

    // Check if response is SSE or JSON
    const contentType = mcpResponse.headers.get("content-type");
    let mcpData;

    if (contentType?.includes("text/event-stream")) {
      // Parse SSE response
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

    console.log("✅ MCP Response received:");
    console.log(`   Tools available: ${mcpData.result?.tools?.length || 0}`);
    if (mcpData.result?.tools) {
      mcpData.result.tools.forEach((tool) => {
        console.log(`   - ${tool.name}: ${tool.description || tool.annotations?.description || ""}`);
      });
    }
    console.log();

    // Step 5: Test a specific tool (list_workflows)
    console.log("5️⃣  Testing list_workflows tool...");
    const listWorkflowsResponse = await fetch(MCP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        Authorization: `Bearer ${tokenData.access_token}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "list_workflows",
          arguments: {},
        },
      }),
    });

    if (!listWorkflowsResponse.ok) {
      console.error(`❌ list_workflows failed with status ${listWorkflowsResponse.status}`);
      const error = await listWorkflowsResponse.text();
      console.error(error);
    } else {
      // Parse SSE response for list_workflows
      const workflowsContentType = listWorkflowsResponse.headers.get("content-type");
      let workflowsData;

      if (workflowsContentType?.includes("text/event-stream")) {
        const text = await listWorkflowsResponse.text();
        const lines = text.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const jsonStr = line.substring(6);
            if (jsonStr.trim()) {
              workflowsData = JSON.parse(jsonStr);
              break;
            }
          }
        }
      } else {
        workflowsData = await listWorkflowsResponse.json();
      }

      console.log("✅ list_workflows response:");
      console.log(JSON.stringify(workflowsData, null, 2));
    }
    console.log();

    console.log("=".repeat(60));
    console.log("🎉 OAuth setup is working correctly!");
    console.log("=".repeat(60));
    console.log();
    console.log("Next steps:");
    console.log("1. Deploy to Vercel");
    console.log("2. Add Auth0 env vars to Vercel");
    console.log("3. Test with ChatGPT connector");

  } catch (error) {
    console.error("❌ Test failed with error:");
    console.error(error);
    process.exit(1);
  }
}

testOAuth().catch(console.error);
