# Per-User API Key Setup Guide

This guide will help you set up per-user HITL API keys using Auth0.

## What You'll Build

Users will be able to:
1. Log in with OAuth (via Auth0)
2. Visit `/setup-api-key` page
3. Enter their own HITL API key
4. Key is saved to their Auth0 profile
5. Key is automatically included in their access token
6. MCP server uses their personal API key

---

## Step 1: Create Auth0 Management API Application

You need this so your backend can update user profiles.

### Actions:

1. Go to **Auth0 Dashboard** → **Applications** → **Applications**

2. Click **Create Application**

3. Fill in:
   - **Name**: `HITL MCP Management API`
   - **Type**: **Machine to Machine Applications**

4. Click **Create**

5. On the "Authorize" screen:
   - **Select an API**: Choose **Auth0 Management API**
   - **Permissions**: Check these:
     - ✅ `read:users`
     - ✅ `update:users`
     - ✅ `read:user_idp_tokens`

6. Click **Authorize**

7. Go to the **Settings** tab and copy:
   - **Client ID**: `___________________________`
   - **Client Secret**: `___________________________` (click "Reveal" first)

---

## Step 2: Update Environment Variables

Add the Management API credentials to your `.env.local`:

```bash
# Existing Auth0 configuration
AUTH0_ISSUER_URL=https://dev-b6psakqdctan3n61.us.auth0.com
AUTH0_AUDIENCE=https://mcp.hitl.sh
AUTH0_CLIENT_ID=Hg119LotTNdDHTz9GbNnLhmI0hUsg6Iw
AUTH0_CLIENT_SECRET=M6iXOkmK-qVr5DktSNh3XNzk0nkDGRKdoD-ub7Vj3DfSpjDTkN6lA10Di7JQzWOI

# NEW: Management API credentials (add these)
AUTH0_MANAGEMENT_CLIENT_ID=your_management_client_id_here
AUTH0_MANAGEMENT_CLIENT_SECRET=your_management_client_secret_here

# HITL API Key (fallback for users who haven't set their own)
HITL_API_KEY=hitl_live_082befdbc0b3953a81fd47d4e4cf51e9819849577b91d72b
```

Replace `your_management_client_id_here` and `your_management_client_secret_here` with the values you copied in Step 1.

---

## Step 3: Set Up the Auth0 Action

This action adds the user's API key to their access token.

### 3.1 Create the Action

1. Go to **Auth0 Dashboard** → **Actions** → **Library**

2. Click **Build Custom** (the + button)

3. Fill in:
   - **Name**: `Add HITL API Key`
   - **Trigger**: **Login / Post Login**
   - **Runtime**: Node.js 18 (default)

4. Click **Create**

5. Replace the code with:

```javascript
exports.onExecutePostLogin = async (event, api) => {
  // Use a namespaced claim to avoid conflicts
  const namespace = 'https://mcp.hitl.sh';

  // Get HITL API key from user metadata
  const hitlApiKey = event.user.user_metadata?.hitl_api_key;

  if (hitlApiKey) {
    // Add to access token claims
    api.accessToken.setCustomClaim(`${namespace}/hitl_api_key`, hitlApiKey);
  }
};
```

6. Click **Deploy** (top right)

### 3.2 Add Action to Login Flow

1. Go to **Auth0 Dashboard** → **Actions** → **Flows**

2. Click **Login**

3. In the flow editor:
   - Click the **Custom** tab in the right panel
   - Find your **"Add HITL API Key"** action
   - **Drag and drop** it between **Start** and **Complete**

4. Click **Apply** (top right)

---

## Step 4: Test Locally

### 4.1 Start the Server

```bash
pnpm dev
```

### 4.2 Get an OAuth Token

```bash
curl --request POST \
  --url 'https://dev-b6psakqdctan3n61.us.auth0.com/oauth/token' \
  --header 'content-type: application/json' \
  --data '{
    "client_id": "Hg119LotTNdDHTz9GbNnLhmI0hUsg6Iw",
    "client_secret": "M6iXOkmK-qVr5DktSNh3XNzk0nkDGRKdoD-ub7Vj3DfSpjDTkN6lA10Di7JQzWOI",
    "audience": "https://mcp.hitl.sh",
    "grant_type": "client_credentials"
  }'
```

Save the `access_token` from the response.

### 4.3 Visit the API Key Setup Page

Option A - In browser:
1. Open `http://localhost:3002/setup-api-key`
2. You'll need to implement OAuth login flow for the browser

Option B - Using curl:
```bash
curl -X POST http://localhost:3002/api/update-hitl-key \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"hitl_api_key": "hitl_live_your_personal_key_here"}'
```

Expected response:
```json
{
  "success": true,
  "message": "HITL API key saved successfully..."
}
```

### 4.4 Verify the Key Was Saved

Get a new access token (the old one won't have the key):
```bash
curl --request POST \
  --url 'https://dev-b6psakqdctan3n61.us.auth0.com/oauth/token' \
  --header 'content-type: application/json' \
  --data '{
    "client_id": "Hg119LotTNdDHTz9GbNnLhmI0hUsg6Iw",
    "client_secret": "M6iXOkmK-qVr5DktSNh3XNzk0nkDGRKdoD-ub7Vj3DfSpjDTkN6lA10Di7JQzWOI",
    "audience": "https://mcp.hitl.sh",
    "grant_type": "client_credentials"
  }'
```

Decode the JWT token at https://jwt.io and look for the claim:
```json
{
  "https://mcp.hitl.sh/hitl_api_key": "hitl_live_your_personal_key_here"
}
```

### 4.5 Test MCP Call

```bash
curl -X POST http://localhost:3002/mcp \
  -H "Authorization: Bearer YOUR_NEW_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "list_loops",
      "arguments": {}
    }
  }'
```

This should use the user's personal HITL API key! ✅

---

## Step 5: Deploy to Vercel

### 5.1 Add Environment Variables to Vercel

1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables

2. Add all these variables:

```
AUTH0_ISSUER_URL=https://dev-b6psakqdctan3n61.us.auth0.com
AUTH0_AUDIENCE=https://mcp.hitl.sh
AUTH0_CLIENT_ID=Hg119LotTNdDHTz9GbNnLhmI0hUsg6Iw
AUTH0_CLIENT_SECRET=M6iXOkmK-qVr5DktSNh3XNzk0nkDGRKdoD-ub7Vj3DfSpjDTkN6lA10Di7JQzWOI
AUTH0_MANAGEMENT_CLIENT_ID=your_management_client_id
AUTH0_MANAGEMENT_CLIENT_SECRET=your_management_client_secret
HITL_API_KEY=hitl_live_082befdbc0b3953a81fd47d4e4cf51e9819849577b91d72b
```

3. Click **Save**

### 5.2 Deploy

```bash
git add .
git commit -m "Add per-user API key support"
git push
```

Vercel will automatically deploy.

---

## Step 6: Test with ChatGPT

1. Go to **ChatGPT** → **Settings** → **Developer mode** → **Connectors**

2. Click **Create new connector**

3. Fill in:
   - **Type**: MCP
   - **URL**: `https://your-vercel-app.vercel.app/mcp`
   - **Authentication**: OAuth

4. ChatGPT will:
   - Discover OAuth configuration from `/.well-known/oauth-protected-resource`
   - Redirect you to Auth0 login
   - Exchange authorization code for access token
   - Store the token

5. After connecting, visit `https://your-vercel-app.vercel.app/setup-api-key` to set your HITL API key

6. Log out and log back in to ChatGPT

7. Try using the HITL tools in ChatGPT!

---

## How It Works

```
┌─────────────┐
│   User      │
│  (ChatGPT)  │
└──────┬──────┘
       │
       │ 1. Login via OAuth
       ↓
┌─────────────┐
│   Auth0     │──→ Returns access token
└──────┬──────┘    (includes hitl_api_key claim if set)
       │
       │ 2. Call MCP with token
       ↓
┌─────────────┐
│ MCP Server  │──→ Extracts hitl_api_key from token
└──────┬──────┘    Falls back to HITL_API_KEY env var
       │
       │ 3. Call HITL API
       ↓
┌─────────────┐
│  HITL.sh    │──→ Uses user's personal API key
└─────────────┘
```

---

## Troubleshooting

### Error: "Missing Auth0 Management API credentials"

**Cause**: `AUTH0_MANAGEMENT_CLIENT_ID` or `AUTH0_MANAGEMENT_CLIENT_SECRET` not set

**Fix**: Add them to `.env.local` (local) or Vercel environment variables (production)

### Error: "Failed to update user metadata: 403"

**Cause**: Management API application doesn't have correct permissions

**Fix**:
1. Go to Auth0 Dashboard → Applications → APIs → Auth0 Management API
2. Find your Management API application
3. Ensure it has `read:users` and `update:users` permissions

### Error: "Invalid or expired token"

**Cause**: OAuth token is invalid or expired

**Fix**: Log out and log back in to get a new token

### User's API key not in token

**Cause**: Auth0 Action not deployed or not in Login flow

**Fix**:
1. Check Auth0 Dashboard → Actions → Library → "Add HITL API Key" is deployed
2. Check Auth0 Dashboard → Actions → Flows → Login → Action is in the flow

### MCP still using shared API key

**Cause**: User hasn't set their personal API key, or hasn't logged out/in after setting it

**Fix**:
1. Ensure user visited `/setup-api-key` and saved their key
2. User must log out and log back in for the new token to include the key
3. Decode the token at jwt.io to verify the claim is present

---

## Summary

✅ Files created:
- [app/setup-api-key/page.tsx](app/setup-api-key/page.tsx) - User-facing page
- [app/api/update-hitl-key/route.ts](app/api/update-hitl-key/route.ts) - Backend API

✅ What you need to do:
1. Create Management API application in Auth0
2. Add `AUTH0_MANAGEMENT_CLIENT_ID` and `AUTH0_MANAGEMENT_CLIENT_SECRET` to environment
3. Create and deploy the Auth0 Action
4. Add the Action to the Login flow

✅ The code is ready - just add the Auth0 credentials!
