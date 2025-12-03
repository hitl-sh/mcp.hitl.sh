# Testing HITL MCP Server with Claude Desktop

This guide walks you through testing your HITL MCP server using Claude Desktop.

## Prerequisites

- Claude Desktop installed (download from [claude.ai/download](https://claude.ai/download))
- Your HITL MCP server running locally or deployed
- Your HITL API key

## Step-by-Step Setup

### Step 1: Locate Claude Desktop Configuration File

The configuration file location depends on your operating system:

**macOS:**
```bash
~/Library/Application Support/Claude/config.json
```

**Windows:**
```bash
%APPDATA%\Claude\claude_desktop_config.json
```

**Linux:**
```bash
~/.config/Claude/claude_desktop_config.json
```

### Step 2: Open the Configuration File

```bash
# macOS - Open with your preferred editor
open -a TextEdit ~/Library/Application\ Support/Claude/config.json
# OR
code ~/Library/Application\ Support/Claude/config.json  # if using VS Code
# OR
nano ~/Library/Application\ Support/Claude/config.json
```

### Step 3: Add MCP Server Configuration

#### Option A: Local Development Server

If testing locally (server running on `localhost:3002`):

```json
{
  "mcpServers": {
    "hitl-local": {
      "url": "http://localhost:3002/mcp",
      "transport": "streamableHttp",
      "headers": {
        "Authorization": "Bearer YOUR_HITL_API_KEY_HERE"
      }
    }
  }
}
```

**Important Notes for Local Testing:**
- Make sure your dev server is running (`pnpm dev`)
- The server must be accessible at `http://localhost:3002/mcp`
- Keep the terminal with `pnpm dev` running while using Claude Desktop

#### Option B: Production/Deployed Server

If testing against a deployed server (e.g., Vercel):

```json
{
  "mcpServers": {
    "hitl-production": {
      "url": "https://your-app.vercel.app/mcp",
      "transport": "streamableHttp",
      "headers": {
        "Authorization": "Bearer YOUR_HITL_API_KEY_HERE"
      }
    }
  }
}
```

#### Option C: Both Local and Production

You can configure both:

```json
{
  "mcpServers": {
    "hitl-local": {
      "url": "http://localhost:3002/mcp",
      "transport": "streamableHttp",
      "headers": {
        "Authorization": "Bearer YOUR_HITL_API_KEY_HERE"
      }
    },
    "hitl-production": {
      "url": "https://your-app.vercel.app/mcp",
      "transport": "streamableHttp",
      "headers": {
        "Authorization": "Bearer YOUR_HITL_API_KEY_HERE"
      }
    }
  }
}
```

### Step 4: Save and Restart Claude Desktop

1. Save the configuration file
2. **Completely quit Claude Desktop** (not just close the window)
   - **macOS:** `Cmd + Q` or right-click dock icon → Quit
   - **Windows:** Right-click system tray → Exit
   - **Linux:** Close all windows and ensure process is terminated
3. Reopen Claude Desktop

### Step 5: Verify MCP Server Connection

After reopening Claude Desktop:

1. Look for the **MCP icon** (🔌) in the interface
2. Click on it to see available MCP servers
3. You should see "hitl-local" or "hitl-production" listed
4. Check that all 7 tools are available:
   - list_loops
   - create_request
   - list_requests
   - get_request
   - update_request
   - cancel_request
   - add_request_feedback

### Step 6: Test the Tools

Try these prompts in Claude Desktop to test your MCP tools:

#### Test 1: List Loops
```
Can you list all my HITL loops?
```

Expected: Claude will use the `list_loops` tool and show your loops.

#### Test 2: List Requests
```
Show me all my pending requests
```

Expected: Claude will use `list_requests` with status filter.

#### Test 3: Create a Request
```
Create a test request in my first loop asking reviewers to rate content quality from 1-5
```

Expected: Claude will:
1. First call `list_loops` to get your loop ID
2. Then call `create_request` with appropriate parameters

#### Test 4: Get Request Details
```
Get the details of request ID [paste-request-id-here]
```

Expected: Claude will use `get_request` to fetch details.

#### Test 5: Update Request
```
Update request [request-id] to have high priority
```

Expected: Claude will use `update_request` to change priority.

#### Test 6: Cancel Request
```
Cancel request [request-id]
```

Expected: Claude will use `cancel_request` (DELETE method).

#### Test 7: Add Feedback
```
Add feedback to request [request-id] with a rating of 5 stars
```

Expected: Claude will use `add_request_feedback`.

## Troubleshooting

### Issue: MCP Server Not Appearing

**Solution:**
1. Verify the config file path is correct
2. Check JSON syntax is valid (use [jsonlint.com](https://jsonlint.com))
3. Ensure you completely quit and restarted Claude Desktop
4. Check Claude Desktop logs:
   - **macOS:** `~/Library/Logs/Claude/`
   - **Windows:** `%APPDATA%\Claude\logs\`

### Issue: "Server Connection Failed"

**Solution:**
1. **For local server:** Ensure `pnpm dev` is running
2. Check the URL is correct (port 3002 or 3000?)
3. Test the endpoint manually:
   ```bash
   curl -X POST http://localhost:3002/mcp \
     -H "Authorization: Bearer YOUR_HITL_API_KEY_HERE" \
     -H "Content-Type: application/json" \
     -H "Accept: application/json, text/event-stream" \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
   ```

### Issue: "Authentication Failed"

**Solution:**
1. Double-check your API key is correct
2. Ensure the `Authorization` header format is exactly: `Bearer hitl_live_...`
3. Verify the API key is still valid at [hitl.sh](https://hitl.sh)

### Issue: Tools Not Showing

**Solution:**
1. Check server logs for errors
2. Restart your local dev server
3. Clear Claude Desktop cache and restart
4. Verify the MCP handler is working:
   ```bash
   node scripts/test-hitl-mcp.mjs http://localhost:3002/mcp YOUR_HITL_API_KEY_HERE
   ```

## Advanced Configuration

### Using Environment Variables

Instead of hardcoding the API key, you can use environment variables:

```json
{
  "mcpServers": {
    "hitl-local": {
      "url": "http://localhost:3002/mcp",
      "transport": "streamableHttp",
      "headers": {
        "Authorization": "Bearer ${HITL_API_KEY}"
      }
    }
  }
}
```

Then set the environment variable:
```bash
# macOS/Linux - Add to ~/.zshrc or ~/.bashrc
export HITL_API_KEY="YOUR_HITL_API_KEY_HERE"

# Restart Claude Desktop from terminal with env vars loaded
```

### Multiple API Keys

If you have different API keys for different environments:

```json
{
  "mcpServers": {
    "hitl-dev": {
      "url": "http://localhost:3002/mcp",
      "transport": "streamableHttp",
      "headers": {
        "Authorization": "Bearer hitl_live_dev_key_here"
      }
    },
    "hitl-staging": {
      "url": "https://staging.example.com/mcp",
      "transport": "streamableHttp",
      "headers": {
        "Authorization": "Bearer hitl_live_staging_key_here"
      }
    },
    "hitl-prod": {
      "url": "https://prod.example.com/mcp",
      "transport": "streamableHttp",
      "headers": {
        "Authorization": "Bearer hitl_live_prod_key_here"
      }
    }
  }
}
```

## Testing Workflow

### Recommended Testing Flow:

1. **Start Local Server**
   ```bash
   cd /Users/rexasare/dev/AI/mcp-servers/mcp.hitl.sh
   pnpm dev
   ```

2. **Configure Claude Desktop** (one-time setup)
   - Add MCP server to config
   - Restart Claude Desktop

3. **Test Each Tool Individually**
   - Start with simple reads (`list_loops`, `list_requests`)
   - Test create operations (`create_request`)
   - Test update operations (`update_request`)
   - Test delete operations (`cancel_request`)
   - Test feedback (`add_request_feedback`)

4. **Test Complex Workflows**
   - Ask Claude to create, update, and cancel a request in one conversation
   - Ask Claude to analyze your request patterns
   - Have Claude help you triage support tickets using the tools

5. **Monitor Server Logs**
   - Keep an eye on your terminal running `pnpm dev`
   - Watch for any errors or unexpected behavior

## Example Conversation Flow

Here's a complete example conversation to test all tools:

```
You: Hi! I'd like to test my HITL MCP integration. Can you start by showing me all my loops?

Claude: [Uses list_loops tool and shows results]

You: Great! Now create a test request in the first loop asking reviewers to categorize a support ticket as either "Bug", "Feature Request", or "Question". Set the priority to high.

Claude: [Uses create_request with single_select response type]

You: Perfect! Can you show me the details of that request?

Claude: [Uses get_request to fetch details]

You: Now update it to critical priority instead of high.

Claude: [Uses update_request to change priority]

You: Thanks! Let's cancel this test request now.

Claude: [Uses cancel_request to delete the request]

You: Excellent! Show me all my recent requests now.

Claude: [Uses list_requests to show updated list]
```

## Next Steps

Once you've verified everything works in Claude Desktop:

1. Deploy your MCP server to production (Vercel, etc.)
2. Update Claude Desktop config to use production URL
3. Share the MCP server with your team
4. Build more complex workflows with HITL integration

## Resources

- [Claude MCP Documentation](https://docs.anthropic.com/claude/docs/model-context-protocol)
- [HITL.sh API Docs](https://docs.hitl.sh)
- [MCP Server Specification](https://spec.modelcontextprotocol.io)
- [Vercel MCP Deployment Guide](https://github.com/vercel-labs/mcp-on-vercel)
