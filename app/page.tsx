'use client';

import Link from 'next/link';
import React from 'react';

function WireframeOrb() {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const rafRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current!;
    const context = canvas.getContext('2d') as CanvasRenderingContext2D | null;
    if (!context) return;
    const ctx: CanvasRenderingContext2D = context;

    let width = 0;
    let height = 0;
    let dpr = Math.min(2, window.devicePixelRatio || 1);

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    resize();
    window.addEventListener('resize', resize);

    const FOV = 520; // perspective
    const center = () => ({ cx: width / 2, cy: height / 2 });

    function rotateX(p: [number, number, number], a: number) {
      const [x, y, z] = p;
      const s = Math.sin(a), c = Math.cos(a);
      return [x, y * c - z * s, y * s + z * c] as [number, number, number];
    }

    function rotateY(p: [number, number, number], a: number) {
      const [x, y, z] = p;
      const s = Math.sin(a), c = Math.cos(a);
      return [x * c + z * s, y, -x * s + z * c] as [number, number, number];
    }

    function project(p: [number, number, number]) {
      const { cx, cy } = center();
      const [x, y, z] = p;
      const s = FOV / (FOV + z);
      return [cx + x * s, cy + y * s] as [number, number];
    }

    function torus(u: number, v: number, R: number, r: number) {
      const cu = Math.cos(u), su = Math.sin(u);
      const cv = Math.cos(v), sv = Math.sin(v);
      const x = (R + r * cv) * cu;
      const y = (R + r * cv) * su;
      const z = r * sv;
      return [x, y, z] as [number, number, number];
    }

    const U = 52;
    const V = 26;

    function frame(t: number) {
      ctx.clearRect(0, 0, width, height);

      // subtle backdrop vignette
      const g = ctx.createRadialGradient(
        width * 0.5,
        height * 0.5,
        0,
        width * 0.5,
        height * 0.5,
        Math.max(width, height) * 0.75
      );
      g.addColorStop(0, 'rgba(14,18,34,0.10)');
      g.addColorStop(1, 'rgba(14,18,34,0.0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, height);

      const base = Math.min(width, height) * 0.28;
      const R = base * 1.0;
      const r = base * 0.42;

      const a = t * 0.00035;
      const b = t * 0.00022;

      ctx.lineWidth = 1.0;
      ctx.strokeStyle = 'rgba(120,160,255,0.18)';

      // draw longitudinal lines (constant u)
      for (let i = 0; i < U; i++) {
        const u = (i / U) * Math.PI * 2;
        ctx.beginPath();
        for (let j = 0; j <= V; j++) {
          const v = (j / V) * Math.PI * 2;
          let p = torus(u, v, R, r);
          p = rotateX(p, a);
          p = rotateY(p, b);
          const [sx, sy] = project(p);
          if (j === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        }
        ctx.stroke();
      }

      // draw latitudinal lines (constant v)
      for (let j = 0; j < V; j++) {
        const v = (j / V) * Math.PI * 2;
        ctx.beginPath();
        for (let i = 0; i <= U; i++) {
          const u = (i / U) * Math.PI * 2;
          let p = torus(u, v, R, r);
          p = rotateX(p, a);
          p = rotateY(p, b);
          const [sx, sy] = project(p);
          if (i === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        }
        ctx.stroke();
      }

      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 0,
        opacity: 0.9,
      }}
    />
  );
}

export default function HomePage() {
  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        padding: '2.5rem 1.25rem',
        position: 'relative',
      }}
    >
      <WireframeOrb />
      <div
        style={{
          maxWidth: '42rem',
          textAlign: 'center',
          position: 'relative',
          zIndex: 2,
        }}
      >
        <h1
          style={{
            fontSize: '2.5rem',
            fontWeight: 700,
            marginBottom: '1rem',
            color: '#111827',
          }}
        >
          HITL.sh MCP Server
        </h1>
        <p
          style={{
            fontSize: '1.125rem',
            color: '#6b7280',
            marginBottom: '2rem',
            lineHeight: 1.6,
          }}
        >
          Connect HITL.sh Human-in-the-Loop tools to ChatGPT and other AI applications.
          Create review requests, gather feedback, and integrate human judgment into your AI workflows.
        </p>

        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '0.75rem',
            flexWrap: 'wrap',
            marginBottom: '2rem',
          }}
        >
          <Link
            href="/setup-api-key"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0.875rem 1.5rem',
              borderRadius: 10,
              background: '#111827',
              color: '#ffffff',
              border: '1px solid rgba(0,0,0,0.1)',
              boxShadow: '0 1px 0 rgba(255,255,255,0.2) inset',
              textDecoration: 'none',
              fontSize: '1rem',
              fontWeight: 500,
            }}
          >
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 8 }}>
              <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path>
            </svg>
            <span>Setup API Key</span>
          </Link>
          <a
            href="https://github.com/your-repo/mcp-hitl"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0.875rem 1.5rem',
              borderRadius: 10,
              background: 'white',
              color: '#111827',
              border: '1px solid rgba(12,20,40,0.12)',
              textDecoration: 'none',
              fontSize: '1rem',
              fontWeight: 500,
            }}
          >
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 8 }}>
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"></path>
            </svg>
            <span>Documentation</span>
          </a>
        </div>

        <div
          style={{
            background: 'rgba(255,255,255,0.8)',
            border: '1px solid rgba(0,0,0,0.08)',
            borderRadius: 12,
            padding: '1.5rem',
            textAlign: 'left',
          }}
        >
          <h2
            style={{
              fontSize: '1.125rem',
              fontWeight: 600,
              marginBottom: '0.75rem',
              color: '#111827',
            }}
          >
            Quick Start for ChatGPT
          </h2>
          <ol
            style={{
              listStyle: 'decimal',
              paddingLeft: '1.5rem',
              margin: 0,
              color: '#4b5563',
              lineHeight: 1.8,
            }}
          >
            <li>Add MCP connector in ChatGPT with URL: <code style={{ background: '#f3f4f6', padding: '0.125rem 0.375rem', borderRadius: 4, fontSize: '0.875rem' }}>https://mcp.hitl.sh/mcp</code></li>
            <li>Sign up through OAuth (create account with email/password)</li>
            <li>Visit <Link href="/setup-api-key" style={{ color: '#2563eb', textDecoration: 'underline' }}>Setup API Key</Link> to add your personal HITL.sh API key</li>
            <li>Start using HITL tools in ChatGPT!</li>
          </ol>
        </div>
      </div>
    </main>
  );
}
