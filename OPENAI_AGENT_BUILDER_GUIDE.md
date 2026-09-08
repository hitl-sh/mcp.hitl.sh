# HITL MCP Server - OpenAI Agent Builder Guide

This guide shows you how to connect the HITL.sh MCP server to OpenAI's Agent Builder using direct API key authentication.

---

## 🚀 Quick Start

### Step 1: Get Your HITL API Key

1. Go to [HITL.sh](https://hitl.sh)
2. Sign up or log in to your account
3. Navigate to **Dashboard** → **API Keys**
4. Copy your API key (starts with `hitl_live_` or `hitl_test_`)

Example: `hitl_live_082befdbc0b3953a81fd47d4e4cf51e9819849577b91d72b`

---

### Step 2: Add MCP Server to OpenAI Agent Builder

1. **Open OpenAI Agent Builder**
2. **Add a new Action/Tool/MCP Server** (depending on the UI)
3. **Configure as follows**:

   **Server URL**:
   ```
   https://mcp.hitl.sh/mcp-simple
   ```

   **Authentication Type**:
   ```
   Bearer Token
   ```

   **Token/API Key**:
   ```
   hitl_live_your_actual_api_key_here
   ```

4. **Save** the configuration

---

### Step 3: Test the Connection

Ask your OpenAI agent:
> "List my HITL workflows"

The agent should call the `list_loops` tool and show you your workflows! ✅

---

## 🛠️ Available Tools

Your OpenAI agent now has access to these HITL tools:

### Workflow Management

- **`list_loops`** - View all your HITL workflows
- **`get_loop`** - Get details about a specific workflow

### Response Management

- **`create_request`** - Create a new review response
  ```
  Example: "Create a review response in workflow loop_abc123 asking
  reviewers to categorize this support ticket as Bug, Feature, or Question"
  ```

- **`list_requests`** - List all responses with optional filters
  ```
  Example: "Show me all pending responses"
  Example: "List high priority responses in workflow loop_abc123"
  ```

- **`get_request`** - Get details about a specific response
  ```
  Example: "What's the status of response req_xyz789?"
  ```

- **`update_request`** - Update response text, priority, or configuration
  ```
  Example: "Update response req_xyz789 to high priority"
  ```

- **`cancel_request`** - Cancel a pending response
  ```
  Example: "Cancel response req_xyz789"
  ```

### Feedback

- **`add_request_feedback`** - Add feedback to a completed response
  ```
  Example: "Add feedback to response req_xyz789 with rating: 5"
  ```

---

## 💡 Example Workflows

### 1. Create and Track a Review Response

**You**: "Create a HITL response asking reviewers to classify this email as spam or not spam. The email says: 'Congratulations! You won $1 million!'"

**Agent**:
1. Uses `list_loops` to find your first workflow
2. Uses `create_request` to create the response
3. Returns the response ID

**You**: "What's the status of that response?"

**Agent**:
1. Uses `get_request` with the ID
2. Shows status (pending/claimed/completed)
3. If completed, shows the reviewer's answer

---

### 2. Bulk Response Management

**You**: "Show me all pending high-priority responses"

**Agent**:
1. Uses `list_requests` with filters: `status=pending, priority=high`
2. Shows you the list

**You**: "Cancel all of them"

**Agent**:
1. For each response, uses `cancel_request`
2. Confirms cancellation

---

### 3. Feedback Collection

**You**: "Get response req_abc123 and show me the feedback"

**Agent**:
1. Uses `get_request` to fetch details
2. Shows the response text, status, and reviewer feedback

---

## 🔧 Differences from OAuth Endpoint

This simple endpoint (`/mcp-simple`) differs from the OAuth endpoint (`/mcp`):

| Feature | `/mcp-simple` (This Guide) | `/mcp` (OAuth) |
|---------|---------------------------|----------------|
| **Authentication** | Direct Bearer Token (HITL API Key) | OAuth 2.0 with Auth0 |
| **Setup** | Simple - just paste API key | Complex - OAuth flow |
| **Best For** | OpenAI Agent Builder, Zapier, Make.com | ChatGPT, Claude Desktop |
| **API Key Source** | User provides in Bearer token | From Auth0 user metadata |
| **User Tracking** | No Auth0 user tracking | Tracked by Auth0 user ID |

---

## 🔐 Security Notes

### Your API Key is Safe

- Your HITL API key is sent in the `Authorization` header (HTTPS encrypted)
- It's never stored on our server
- Each request uses your key directly to call HITL.sh

### Revoke Access

To revoke access:
1. Go to [HITL.sh Dashboard](https://my.hitl.sh/dashboard)
2. Rotate your API key
3. Update OpenAI Agent Builder with the new key

---

## ❓ Troubleshooting

### "HITL API Key Required" Error

**Problem**: You didn't provide an API key or provided it incorrectly

**Solution**:
- Make sure you selected **"Bearer Token"** authentication
- Paste your full HITL API key (including `hitl_live_` prefix)
- Double-check there are no extra spaces

---

### "Invalid HITL API Key Format" Error

**Problem**: The API key doesn't start with `hitl_live_` or `hitl_test_`

**Solution**:
- Copy the key directly from HITL.sh dashboard
- Make sure you copied the entire key
- Keys should look like: `hitl_live_abc123...` or `hitl_test_xyz789...`

---

### "No loops found" Error

**Problem**: You haven't created any workflows in HITL.sh yet

**Solution**:
1. Go to [HITL.sh](https://hitl.sh)
2. Create at least one workflow
3. Try again in OpenAI Agent Builder

---

### Tools Not Showing Up

**Problem**: OpenAI Agent Builder isn't discovering the tools

**Solution**:
- Make sure you used the correct URL: `https://mcp.hitl.sh/mcp-simple`
- Try removing and re-adding the MCP server
- Check that your API key is valid

---

### "Re-authentication Required" Error

**Problem**: Your HITL API key expired or was rotated

**Solution**:
1. Get a new API key from HITL.sh dashboard
2. Update the Bearer token in OpenAI Agent Builder
3. Save and test again

---

## 🆘 Need Help?

- **HITL Documentation**: [docs.hitl.sh](https://docs.hitl.sh)
- **MCP Server Issues**: Check the main [README.md](README.md)
- **OpenAI Agent Builder**: [OpenAI Documentation](https://platform.openai.com/docs)

---

## 🎉 You're All Set!

Your OpenAI agent can now:
- ✅ Create human review responses
- ✅ Track response status
- ✅ Collect reviewer feedback
- ✅ Manage workflows and responses

Use HITL to add human judgment to your AI workflows! 🚀

---

## 📝 Advanced: Testing with cURL

You can test the endpoint directly:

```bash
curl -X POST https://mcp.hitl.sh/mcp-simple \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer hitl_live_your_api_key_here' \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list"
  }'
```

Expected response:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [
      {
        "name": "list_loops",
        "description": "Retrieve all loops..."
      },
      // ... more tools
    ]
  }
}
```

Test calling a tool:
```bash
curl -X POST https://mcp.hitl.sh/mcp-simple \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer hitl_live_your_api_key_here' \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "list_loops",
      "arguments": {}
    }
  }'
```
