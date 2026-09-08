# HITL.sh MCP Server

HITL.sh is a mobile-powered Human-in-the-Loop platform designed to give AI systems instant access to real human judgment. The entire system is built around our dedicated mobile app, which is required for the product to function and enables human reviewers to receive and complete tasks in real time.

## 🚀 Quick Start for Users

Choose the endpoint that matches your platform:

### For ChatGPT Users (OAuth):

**URL**: `https://mcp.hitl.sh/mcp`

1. **Add MCP Connector** in ChatGPT with URL above
2. **Sign up** through the OAuth flow
3. **(Optional)** Add your personal HITL API key at: `https://mcp.hitl.sh/setup-api-key`
4. **Start using HITL tools!**

📚 [Full ChatGPT Guide](USER_GUIDE.md)

### For OpenAI Agent Builder / Zapier / Make.com (Direct API Key):

**URL**: `https://mcp.hitl.sh/mcp-simple`

1. **Add MCP Server** with URL above
2. **Authentication**: Bearer Token
3. **Token**: Your HITL API key (e.g., `hitl_live_abc123...`)
4. **Start using HITL tools!**

📚 [Full OpenAI Agent Builder Guide](OPENAI_AGENT_BUILDER_GUIDE.md)

---

## 🛠️ For Developers

### Features

- **OAuth 2.1 Authentication** - Secure OAuth flow with Auth0 integration
- **Per-User API Keys** - Users can configure their own HITL.sh API keys
- **7 HITL.sh Tools** - Complete integration with HITL.sh API
- **ChatGPT Compatible** - Works as a connector in ChatGPT
- **Claude Desktop Support** - Standalone stdio server for local use
- **Production Ready** - Deployed on Vercel with proper error handling

## 🛠️ Available Tools

| Tool | Description |
|------|-------------|
| `list_loops` | Retrieve all workflows owned by the authenticated HITL.sh account |
| `create_request` | Create a new response within a specific workflow |
| `list_requests` | List responses with optional filters (status, priority, loop_id, etc.) |
| `get_request` | Fetch detailed information about a single response |
| `update_request` | Update mutable fields of a response (text, priority, config) |
| `delete_request` | Permanently delete a response |
| `cancel_request` | Cancel a pending or claimed response |
| `add_request_feedback` | Attach structured feedback to a completed response |

## 📋 Prerequisites

- Node.js 18+ ([download](https://nodejs.org/))
- HITL.sh API key ([get one here](https://hitl.sh))
- Auth0 account ([sign up](https://auth0.com))
- Vercel account for deployment ([sign up](https://vercel.com))

## 🔧 Environment Variables

### Required for Production

```bash
# HITL.sh Configuration
HITL_API_KEY=hitl_live_your_default_api_key

# Auth0 OAuth Configuration
AUTH0_ISSUER_URL=https://your-tenant.us.auth0.com
AUTH0_AUDIENCE=https://mcp.hitl.sh

# Auth0 M2M Application (for testing OAuth)
AUTH0_CLIENT_ID=your_client_id
AUTH0_CLIENT_SECRET=your_client_secret

# Auth0 Management API (for per-user API keys)
AUTH0_MANAGEMENT_CLIENT_ID=your_management_client_id
AUTH0_MANAGEMENT_CLIENT_SECRET=your_management_client_secret
```

### Optional

```bash
# HITL API Base URL override
HITL_API_BASE=https://api.hitl.sh/v1
```

## 🚀 Quick Start

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd mcp.hitl.sh
npm install
```

### 2. Set Up Auth0

Follow the setup guide in [PER_USER_API_KEY_SETUP.md](PER_USER_API_KEY_SETUP.md) to:
1. Create an Auth0 account and tenant
2. Create an API with audience `https://mcp.hitl.sh`
3. Create M2M applications for testing and management
4. Configure Auth0 Action for per-user API keys

### 3. Configure Environment Variables

Create `.env.local`:

```bash
cp .env.example .env.local
# Edit .env.local with your credentials
```

### 4. Run Locally

```bash
npm run dev
```

Server runs on `http://localhost:3000`

### 5. Test OAuth Flow

```bash
node scripts/test-oauth.mjs http://localhost:3000/mcp
```

## 🌐 Deploy to Vercel

### 1. Push to GitHub

```bash
git add .
git commit -m "Initial commit"
git push origin main
```

### 2. Deploy to Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your GitHub repository
3. Add all environment variables from `.env.local`
4. Click **Deploy**

### 3. Configure Auth0 with Vercel URL

Update your Auth0 applications with your Vercel URL:

**For ChatGPT OAuth Client (SPA):**
- **Allowed Callback URLs**: `https://chatgpt.com/connector_platform_oauth_redirect`
- **Allowed Web Origins**: `https://chatgpt.com, https://chat.openai.com`
- **Allowed Logout URLs**: `https://chatgpt.com, https://chat.openai.com`

## 🤖 Using with ChatGPT

### 1. Create Auth0 SPA Client

1. Auth0 Dashboard → Applications → Create Application
2. Name: `ChatGPT MCP Connector`
3. Type: **Single Page Application**
4. Configure callback URLs (see above)
5. Enable **Connections** → Username-Password-Authentication

### 2. Connect in ChatGPT

1. ChatGPT → Settings → MCP Connectors
2. Add connector with your Vercel URL:
   ```
   https://your-app.vercel.app
   ```
   (Note: Use base URL, not `/mcp` endpoint)
3. Authentication: **OAuth**
4. Complete login flow

### 3. Set Your HITL API Key

Visit `https://your-app.vercel.app/setup-api-key` to configure your personal HITL.sh API key.

## 💻 Using with Claude Desktop

For local Claude Desktop integration, use the standalone stdio server:

### 1. Configure Claude Desktop

Add to `~/Library/Application Support/Claude/config.json`:

```json
{
  "mcpServers": {
    "hitl": {
      "command": "node",
      "args": ["/path/to/mcp.hitl.sh/scripts/claude-desktop-server.mjs"],
      "env": {
        "HITL_API_KEY": "your_hitl_api_key_here"
      }
    }
  }
}
```

### 2. Restart Claude Desktop

The HITL tools will appear in Claude Desktop!

See [CLAUDE_DESKTOP_SETUP.md](CLAUDE_DESKTOP_SETUP.md) for detailed instructions.

## 🧪 Testing

### Test OAuth Flow

```bash
node scripts/test-oauth.mjs http://localhost:3000/mcp
```

### Test All Tools

```bash
node scripts/test-all-tools.mjs http://localhost:3000/mcp your_api_key
```

## 📁 Project Structure

```
mcp.hitl.sh/
├── app/
│   ├── mcp/route.ts                    # Main MCP endpoint
│   ├── setup-api-key/page.tsx          # User API key setup page
│   ├── api/update-hitl-key/route.ts    # API key update endpoint
│   └── .well-known/
│       ├── oauth-protected-resource/   # OAuth discovery
│       └── oauth-authorization-server/ # Auth server metadata
├── lib/
│   ├── hitl-client.ts                  # HITL.sh API client
│   └── auth0-verify.ts                 # Auth0 token verification
├── scripts/
│   ├── claude-desktop-server.mjs       # Stdio server for Claude Desktop
│   ├── test-oauth.mjs                  # OAuth flow test
│   └── test-all-tools.mjs              # All tools test
└── docs/ (via .md files)
```

## 🔐 Security

- **OAuth 2.1** with PKCE for secure authentication
- **JWT verification** using Auth0 JWKS
- **Per-user API keys** stored securely in Auth0 user metadata
- **Environment variable** fallback for shared API key
- **CORS** properly configured for ChatGPT

## 📚 Documentation

- [CLAUDE.md](CLAUDE.md) - For future Claude Code sessions
- [PER_USER_API_KEY_SETUP.md](PER_USER_API_KEY_SETUP.md) - Complete Auth0 setup guide
- [CLAUDE_DESKTOP_SETUP.md](CLAUDE_DESKTOP_SETUP.md) - Local Claude Desktop integration

## 🐛 Troubleshooting

### "Invalid token" errors

- Check that `AUTH0_ISSUER_URL` matches your Auth0 tenant
- Verify token hasn't expired
- Ensure `AUTH0_AUDIENCE` is `https://mcp.hitl.sh`

### ChatGPT connection fails

- Verify Auth0 SPA client has connections enabled
- Check callback URLs are configured correctly
- Ensure dynamic client registration is disabled

### Per-user API keys not working

- Verify Auth0 Action is deployed and in Login flow
- Check user has `hitl_api_key` in user_metadata
- User must log out/in to get new token with API key

## 🤝 Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🔗 Links

- [HITL.sh](https://hitl.sh) - Human-in-the-Loop platform
- [MCP Specification](https://modelcontextprotocol.io/) - Model Context Protocol
- [Auth0 Documentation](https://auth0.com/docs) - OAuth provider
- [Vercel Documentation](https://vercel.com/docs) - Deployment platform

## ✨ Credits

Built with:
- [Next.js 15](https://nextjs.org/)
- [mcp-handler](https://www.npmjs.com/package/mcp-handler)
- [Auth0](https://auth0.com/)
- [HITL.sh](https://hitl.sh/)
