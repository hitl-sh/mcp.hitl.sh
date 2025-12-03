#!/bin/bash

# Required environment variables:
#   AUTH0_DOMAIN - Your Auth0 tenant domain (e.g., dev-xxxxx.us.auth0.com)
#   AUTH0_MGMT_CLIENT_ID - Management API client ID
#   AUTH0_MGMT_CLIENT_SECRET - Management API client secret
#   AUTH0_CONNECTION_ID - The connection ID to promote

if [ -z "$AUTH0_DOMAIN" ] || [ -z "$AUTH0_MGMT_CLIENT_ID" ] || [ -z "$AUTH0_MGMT_CLIENT_SECRET" ]; then
  echo "❌ Missing required environment variables:"
  echo "   AUTH0_DOMAIN, AUTH0_MGMT_CLIENT_ID, AUTH0_MGMT_CLIENT_SECRET"
  exit 1
fi

echo "🔍 Step 1: Getting Management API token..."
MGMT_TOKEN=$(curl -s --request POST \
  --url "https://${AUTH0_DOMAIN}/oauth/token" \
  --header 'content-type: application/json' \
  --data "{
    \"client_id\": \"${AUTH0_MGMT_CLIENT_ID}\",
    \"client_secret\": \"${AUTH0_MGMT_CLIENT_SECRET}\",
    \"audience\": \"https://${AUTH0_DOMAIN}/api/v2/\",
    \"grant_type\": \"client_credentials\"
  }" | jq -r '.access_token')

if [ -z "$MGMT_TOKEN" ] || [ "$MGMT_TOKEN" = "null" ]; then
  echo "❌ Failed to get Management API token"
  exit 1
fi

echo "✅ Got token!"
echo ""

CONNECTION_ID="${AUTH0_CONNECTION_ID:-}"
if [ -z "$CONNECTION_ID" ]; then
  echo "❌ Missing AUTH0_CONNECTION_ID environment variable"
  exit 1
fi

echo "🔧 Step 2: Promoting connection $CONNECTION_ID to domain level..."
RESULT=$(curl -s --request PATCH \
  --url "https://${AUTH0_DOMAIN}/api/v2/connections/$CONNECTION_ID" \
  --header "authorization: Bearer $MGMT_TOKEN" \
  --header 'content-type: application/json' \
  --data '{ "is_domain_connection": true }')

IS_DOMAIN=$(echo "$RESULT" | jq -r '.is_domain_connection')

if [ "$IS_DOMAIN" = "true" ]; then
  echo "✅ SUCCESS! Connection is now domain-level."
  echo ""
  echo "🎉 ChatGPT can now use dynamic client registration!"
  echo ""
  echo "Next steps:"
  echo "1. Delete old ChatGPT clients from Auth0 dashboard"
  echo "2. Set OAuth back to required: true in app/mcp/route.ts"
  echo "3. Deploy to Vercel"
  echo "4. Remove and re-add MCP connector in ChatGPT"
  echo "5. Test the OAuth flow"
else
  echo "❌ Failed to promote connection"
  echo ""
  echo "Response:"
  echo "$RESULT" | jq '.'
fi
