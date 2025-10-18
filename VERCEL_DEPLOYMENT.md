# Vercel Deployment Guide

## 📋 Environment Variables for Vercel

When deploying to Vercel, add these environment variables in your project settings.

### Go to: Vercel Dashboard → Your Project → Settings → Environment Variables

---

## ✅ Required Environment Variables

Copy and paste these into Vercel (replace with your actual values):

### 1. HITL.sh Configuration

```
HITL_API_KEY
```
**Value**: `hitl_live_082befdbc0b3953a81fd47d4e4cf51e9819849577b91d72b`

**Description**: Fallback HITL.sh API key (used when users haven't set their own)

---

### 2. Auth0 OAuth Configuration

```
AUTH0_ISSUER_URL
```
**Value**: `https://dev-b6psakqdctan3n61.us.auth0.com`

**Description**: Your Auth0 tenant URL

---

```
AUTH0_AUDIENCE
```
**Value**: `https://mcp.hitl.sh`

**Description**: API audience identifier (must match your Auth0 API)

---

### 3. Auth0 M2M Application (for Testing)

```
AUTH0_CLIENT_ID
```
**Value**: `Hg119LotTNdDHTz9GbNnLhmI0hUsg6Iw`

**Description**: Client ID for testing OAuth flows

---

```
AUTH0_CLIENT_SECRET
```
**Value**: `M6iXOkmK-qVr5DktSNh3XNzk0nkDGRKdoD-ub7Vj3DfSpjDTkN6lA10Di7JQzWOI`

**Description**: Client secret for testing OAuth flows

---

### 4. Auth0 Management API (for Per-User API Keys)

```
AUTH0_MANAGEMENT_CLIENT_ID
```
**Value**: `An9QnOq9AvSwT83oqqkLJIqP3nC5mHt5`

**Description**: Management API client ID

---

```
AUTH0_MANAGEMENT_CLIENT_SECRET
```
**Value**: `gTZJxW5paGtfPs1f2jA6ylfgIhG6wzZG-ZfFe9o2La7m3IvmHQMhFQUN-86RhOvu`

**Description**: Management API client secret

---

## 🎯 Quick Copy-Paste Table

For each variable, copy the **Key** and **Value**:

| Key | Value |
|-----|-------|
| `HITL_API_KEY` | `hitl_live_082befdbc0b3953a81fd47d4e4cf51e9819849577b91d72b` |
| `AUTH0_ISSUER_URL` | `https://dev-b6psakqdctan3n61.us.auth0.com` |
| `AUTH0_AUDIENCE` | `https://mcp.hitl.sh` |
| `AUTH0_CLIENT_ID` | `Hg119LotTNdDHTz9GbNnLhmI0hUsg6Iw` |
| `AUTH0_CLIENT_SECRET` | `M6iXOkmK-qVr5DktSNh3XNzk0nkDGRKdoD-ub7Vj3DfSpjDTkN6lA10Di7JQzWOI` |
| `AUTH0_MANAGEMENT_CLIENT_ID` | `An9QnOq9AvSwT83oqqkLJIqP3nC5mHt5` |
| `AUTH0_MANAGEMENT_CLIENT_SECRET` | `gTZJxW5paGtfPs1f2jA6ylfgIhG6wzZG-ZfFe9o2La7m3IvmHQMhFQUN-86RhOvu` |

---

## 📝 How to Add in Vercel

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)

2. Select your project (or create new one)

3. Go to **Settings** → **Environment Variables**

4. For each variable above:
   - Click **Add New**
   - **Key**: Enter the variable name (e.g., `HITL_API_KEY`)
   - **Value**: Enter the value
   - **Environments**: Select **Production**, **Preview**, and **Development** (all three)
   - Click **Save**

5. After adding all variables, **redeploy** your project:
   - Go to **Deployments** tab
   - Click **Redeploy** on the latest deployment

---

## 🔒 Security Notes

**⚠️ IMPORTANT:**

1. **Never commit** `.env.local` to git (already in `.gitignore`)

2. **Secrets are encrypted** in Vercel - safe to store there

3. **Rotate secrets** if they're ever exposed:
   - Generate new HITL API key at hitl.sh
   - Create new Auth0 applications if needed

4. **Use different keys** for production vs development if possible

---

## ✅ Verification After Deployment

After deploying and adding environment variables:

### 1. Test OAuth Discovery

```bash
curl https://your-app.vercel.app/.well-known/oauth-protected-resource
```


Expected response:
```json
{
  "resource": "https://your-app.vercel.app/mcp",
  "authorization_servers": ["https://dev-b6psakqdctan3n61.us.auth0.com"]
}
```

### 2. Test OAuth Flow

```bash
node scripts/test-oauth.mjs https://your-app.vercel.app/mcp
```

Should complete successfully ✅

---

## 🚀 Next Steps After Deployment

1. **Update Auth0 Applications** with your Vercel URL
   - Add Vercel URL to allowed callback URLs
   - Add to allowed origins

2. **Create Auth0 SPA Client** for ChatGPT
   - Follow [README.md](README.md#using-with-chatgpt)

3. **Test with ChatGPT**
   - Connect using your Vercel URL
   - Complete OAuth flow
   - Use HITL tools!

---

## 📊 Environment Variables Summary

**Total**: 7 required variables

- ✅ HITL.sh: 1 variable (API key)
- ✅ Auth0 OAuth: 2 variables (issuer, audience)
- ✅ Auth0 Testing: 2 variables (client ID/secret)
- ✅ Auth0 Management: 2 variables (management client ID/secret)

**All set!** 🎉 Your app is ready for production deployment.
