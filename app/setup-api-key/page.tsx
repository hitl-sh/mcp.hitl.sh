'use client';

import { useState } from 'react';

export default function SetupApiKey() {
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setError('');

    try {
      const response = await fetch('/api/update-hitl-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hitl_api_key: apiKey }),
      });

      if (response.ok) {
        setMessage('API key saved successfully! Please log out and log back in for changes to take effect.');
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

  return (
    <div style={{
      maxWidth: '600px',
      margin: '50px auto',
      padding: '20px',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      <h1>Configure Your HITL API Key</h1>
      <p style={{ color: '#666', marginBottom: '30px' }}>
        Enter your HITL.sh API key to use the MCP server. You can find your API key in your{' '}
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
              padding: '10px',
              fontSize: '16px',
              border: '1px solid #ddd',
              borderRadius: '4px',
            }}
          />
        </div>

        <button
          type="submit"
          disabled={loading || !apiKey}
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            backgroundColor: loading ? '#ccc' : '#0070f3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Saving...' : 'Save API Key'}
        </button>
      </form>

      {message && (
        <div style={{
          marginTop: '20px',
          padding: '12px',
          backgroundColor: '#d4edda',
          color: '#155724',
          border: '1px solid #c3e6cb',
          borderRadius: '4px',
        }}>
          {message}
        </div>
      )}

      {error && (
        <div style={{
          marginTop: '20px',
          padding: '12px',
          backgroundColor: '#f8d7da',
          color: '#721c24',
          border: '1px solid #f5c6cb',
          borderRadius: '4px',
        }}>
          {error}
        </div>
      )}

      <div style={{ marginTop: '40px', padding: '20px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
        <h3 style={{ marginTop: 0 }}>How to get your HITL API Key:</h3>
        <ol style={{ lineHeight: '1.8' }}>
          <li>Go to <a href="https://hitl.sh" target="_blank" rel="noopener noreferrer">hitl.sh</a></li>
          <li>Sign in to your account</li>
          <li>Navigate to Settings or API Keys section</li>
          <li>Copy your API key (starts with <code>hitl_live_</code>)</li>
          <li>Paste it in the form above</li>
        </ol>
      </div>
    </div>
  );
}
