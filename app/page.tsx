import Link from "next/link";

export default function HomePage() {
  return (
    <main style={{
      minHeight: "100dvh",
      display: "grid",
      placeItems: "center",
      padding: "2rem",
      fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, Apple Color Emoji, Segoe UI Emoji",
    }}>
      <section style={{
        maxWidth: 720,
        width: "100%",
        background: "#0b1020",
        color: "#e6e8f2",
        border: "1px solid #1f2a44",
        borderRadius: 12,
        padding: "1.25rem 1.5rem",
        boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
      }}>
        <h1 style={{ fontSize: 24, margin: 0, lineHeight: 1.4 }}>
          HITL MCP Server
        </h1>
        <p style={{ opacity: 0.9, marginTop: 8 }}>
          This deployment exposes a Model Context Protocol server tailored for HITL workflows.
          Point your MCP‑capable client to <code>/mcp</code> and authenticate with a HITL API key.
        </p>
        <ul style={{ marginTop: 12, lineHeight: 1.8 }}>
          <li>
            <strong>Auth:</strong> Bearer token via <code>Authorization</code> header.
          </li>
          <li>
            <strong>Tools:</strong> loop discovery and request lifecycle operations (create, list, get, update, delete, cancel, feedback).
          </li>
          <li>
            <strong>Behavior:</strong> minimal, typed responses designed for reliable agent consumption.
          </li>
        </ul>
        <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
          <Link href="/mcp" style={{ color: "#93c5fd" }}>Open MCP route</Link>
          <Link href="/README" style={{ color: "#93c5fd" }}>Project README</Link>
          <Link href="/.well-known/oauth-protected-resource" style={{ color: "#93c5fd" }}>Well‑known resource</Link>
        </div>
      </section>
    </main>
  );
}
