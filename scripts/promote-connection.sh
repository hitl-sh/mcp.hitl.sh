#!/bin/bash

echo "🔍 Step 1: Getting Management API token..."
MGMT_TOKEN=$(curl -s --request POST \
  --url 'https://dev-b6psakqdctan3n61.us.auth0.com/oauth/token' \
  --header 'content-type: application/json' \
  --data '{
    "client_id": "An9QnOq9AvSwT83oqqkLJIqP3nC5mHt5",
    "client_secret": "gTZJxW5paGtfPs1f2jA6ylfgIhG6wzZG-ZfFe9o2La7m3IvmHQMhFQUN-86RhOvu",
    "audience": "https://dev-b6psakqdctan3n61.us.auth0.com/api/v2/",
    "grant_type": "client_credentials"
  }' | jq -r '.access_token')

if [ -z "$MGMT_TOKEN" ] || [ "$MGMT_TOKEN" = "null" ]; then
  echo "❌ Failed to get Management API token"
  exit 1
fi

echo "✅ Got token!"
echo ""

CONNECTION_ID="con_NqUelRm2YTATavmO"

echo "🔧 Step 2: Promoting connection $CONNECTION_ID to domain level..."
RESULT=$(curl -s --request PATCH \
  --url "https://dev-b6psakqdctan3n61.us.auth0.com/api/v2/connections/$CONNECTION_ID" \
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
  echo "1. Delete old ChatGPT clients from Auth0 dashboard:"
  echo "   - h0IVIBv47RlIqkArwX5NW6T4NBsZS6zE"
  echo "   - ax3XPPzQeqCgQEbj8K3J2mHZJ71Fbms2"
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
