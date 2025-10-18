'use client';

import { useState, useEffect } from 'react';

export default function SetupApiKey() {
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Check if user is authenticated (has access token in URL hash after OAuth redirect)
  useEffect(() => {
    // Check for access token in URL hash (Auth0 implicit flow)
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.substring(1));
    const token = params.get('access_token');

    if (token) {
      setAccessToken(token);
      setIsAuthenticated(true);
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    setCheckingAuth(false);
  }, []);

  const handleLogin = () => {
    const auth0Domain = 'https://dev-b6psakqdctan3n61.us.auth0.com';
    const clientId = 'wNyfQ04waGbVrbmXI0juIRgoWD1SJ5Uq'; // Your ChatGPT Auth0 SPA client
    const redirectUri = encodeURIComponent(window.location.href);
    const audience = encodeURIComponent('https://mcp.hitl.sh');

    const authUrl = `${auth0Domain}/authorize?` +
      `response_type=token&` +
      `client_id=${clientId}&` +
      `redirect_uri=${redirectUri}&` +
      `audience=${audience}&` +
      `scope=openid profile email`;

    window.location.href = authUrl;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setError('');

    if (!accessToken) {
      setError('Please log in first');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/update-hitl-key', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ hitl_api_key: apiKey }),
      });

      if (response.ok) {
        setMessage('✅ API key saved successfully! Please reconnect in ChatGPT for changes to take effect.');
        setApiKey('');
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to save API key');
      }
    } catch (err) {
      setError('An error occurred while saving your API key');
    } finally {
      setLoading(false);
    }
  };

  if (checkingAuth) {
    return (
      <div style={{
        maxWidth: '600px',
        margin: '50px auto',
        padding: '20px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        textAlign: 'center'
      }}>
        <p>Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div style={{
        maxWidth: '600px',
        margin: '50px auto',
        padding: '20px',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}>
        <h1>Configure Your HITL API Key</h1>
        <div style={{
          background: '#fef3c7',
          border: '1px solid #f59e0b',
          borderRadius: '8px',
          padding: '20px',
          marginBottom: '30px'
        }}>
          <p style={{ margin: 0, color: '#92400e' }}>
            ⚠️ You need to log in with your ChatGPT credentials to configure your API key.
          </p>
        </div>

        <button
          onClick={handleLogin}
          style={{
            padding: '16px 32px',
            fontSize: '18px',
            backgroundColor: '#0070f3',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            width: '100%',
            fontWeight: 600,
          }}
        >
          🔐 Log in with Auth0
        </button>

        <div style={{ marginTop: '40px', padding: '20px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
          <h3 style={{ marginTop: 0 }}>Instructions:</h3>
          <ol style={{ lineHeight: '1.8', textAlign: 'left' }}>
            <li>Click "Log in with Auth0" above</li>
            <li>Use the <strong>same email/password</strong> you used when connecting ChatGPT</li>
            <li>After logging in, you'll be able to enter your HITL API key</li>
            <li>Get your HITL API key from <a href="https://hitl.sh/dashboard" target="_blank" rel="noopener noreferrer">hitl.sh/dashboard</a></li>
          </ol>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      maxWidth: '600px',
      margin: '50px auto',
      padding: '20px',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      <h1>Configure Your HITL API Key</h1>
      <div style={{
        background: '#d1fae5',
        border: '1px solid #10b981',
        borderRadius: '8px',
        padding: '16px',
        marginBottom: '30px'
      }}>
        <p style={{ margin: 0, color: '#065f46' }}>
          ✅ You're logged in! Enter your HITL API key below.
        </p>
      </div>

      <p style={{ color: '#666', marginBottom: '30px' }}>
        Enter your HITL.sh API key to use the MCP server with your personal account. You can find your API key in your{' '}
        <a href="https://hitl.sh/dashboard" target="_blank" rel="noopener noreferrer">
          HITL.sh dashboard
        </a>.
      </p>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '20px' }}>
          <label htmlFor="apiKey" style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>
            HITL API Key:
          </label>
          <input
            type="text"
            id="apiKey"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="hitl_live_..."
            required
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              fontSize: '16px',
              border: '1px solid #ddd',
              borderRadius: '6px',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <button
          type="submit"
          disabled={loading || !apiKey}
          style={{
            padding: '14px 28px',
            fontSize: '16px',
            backgroundColor: loading ? '#ccc' : '#0070f3',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: loading ? 'not-allowed' : 'pointer',
            width: '100%',
            fontWeight: 600,
          }}
        >
          {loading ? 'Saving...' : 'Save API Key'}
        </button>
      </form>

      {message && (
        <div style={{
          marginTop: '20px',
          padding: '16px',
          backgroundColor: '#d4edda',
          color: '#155724',
          border: '1px solid #c3e6cb',
          borderRadius: '6px',
          fontWeight: 500,
        }}>
          {message}
        </div>
      )}

      {error && (
        <div style={{
          marginTop: '20px',
          padding: '16px',
          backgroundColor: '#f8d7da',
          color: '#721c24',
          border: '1px solid #f5c6cb',
          borderRadius: '6px',
          fontWeight: 500,
        }}>
          {error}
        </div>
      )}

      <div style={{ marginTop: '40px', padding: '20px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
        <h3 style={{ marginTop: 0 }}>How to get your HITL API Key:</h3>
        <ol style={{ lineHeight: '1.8' }}>
          <li>Go to <a href="https://hitl.sh" target="_blank" rel="noopener noreferrer">hitl.sh</a></li>
          <li>Sign in to your account</li>
          <li>Navigate to Settings or API Keys section</li>
          <li>Copy your API key (starts with <code style={{ background: 'white', padding: '2px 6px', borderRadius: '3px' }}>hitl_live_</code>)</li>
          <li>Paste it in the form above</li>
        </ol>
        <p style={{ marginTop: '20px', fontSize: '14px', color: '#666' }}>
          After saving, disconnect and reconnect your MCP connector in ChatGPT for the changes to take effect.
        </p>
      </div>
    </div>
  );
}
