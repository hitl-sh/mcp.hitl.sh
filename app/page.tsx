'use client';

import Link from 'next/link';
import React from 'react';

function Snowfall() {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const animationRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current!;
    const maybeCtx = canvas.getContext('2d');
    if (!maybeCtx) return;
    const ctx = maybeCtx;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    function onResize() {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    }

    window.addEventListener('resize', onResize);

    const flakes = Array.from({ length: Math.max(60, Math.floor((width * height) / 60000)) }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: 0.6 + Math.random() * 1.2,
      s: 0.15 + Math.random() * 0.35,
      w: Math.random() * 1.2,
      o: 0.15 + Math.random() * 0.35,
    }));

    const bg = ctx.createRadialGradient(width * 0.5, height * -0.2, 0, width * 0.5, height, Math.max(width, height));
    bg.addColorStop(0, 'rgba(255,255,255,0.0)');
    bg.addColorStop(1, 'rgba(255,255,255,0.0)');

    function frame(t: number) {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);
      ctx.save();
      ctx.fillStyle = 'rgba(120,140,180,0.35)';

      for (const f of flakes) {
        f.y += f.s;
        f.x += Math.sin((t * 0.0008 + f.y) * 0.6) * 0.2 + f.w * 0.05;
        if (f.y > height + 5) {
          f.y = -10;
          f.x = Math.random() * width;
        }
        ctx.globalAlpha = f.o;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
      animationRef.current = requestAnimationFrame(frame);
    }

    animationRef.current = requestAnimationFrame(frame);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      window.removeEventListener('resize', onResize);
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
        zIndex: 1,
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
      <Snowfall />

      <section
        style={{
          position: 'relative',
          zIndex: 2,
          maxWidth: 960,
          width: '100%',
          background: 'rgba(255,255,255,0.6)',
          backdropFilter: 'saturate(180%) blur(8px)',
          WebkitBackdropFilter: 'saturate(180%) blur(8px)',
          border: '1px solid rgba(12, 20, 40, 0.08)',
          borderRadius: 16,
          padding: '2rem',
          boxShadow: '0 8px 30px rgba(30, 58, 138, 0.08)',
        }}
      >
        <header style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', opacity: 0.6 }}>HITL • MCP</div>
          <h1
            style={{
              margin: '0.4rem 0 0',
              fontSize: 'clamp(2rem, 5vw, 3rem)',
              lineHeight: 1.15,
              background: 'linear-gradient(90deg, #0b1220 0%, #334155 50%, #0b1220 100%)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            Model Context Protocol for Human‑in‑the‑Loop
          </h1>
          <p style={{ margin: '0.75rem auto 0', maxWidth: 760, fontSize: '1.05rem', opacity: 0.75 }}>
            A minimal, production‑ready MCP endpoint with typed operations for discovery and request lifecycle.
          </p>
        </header>

        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '0.75rem',
            marginTop: '1.5rem',
            flexWrap: 'wrap',
          }}
        >
          <Link
            href="/mcp"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0.7rem 1rem',
              borderRadius: 10,
              background: '#111827',
              color: '#ffffff',
              border: '1px solid rgba(0,0,0,0.1)',
              boxShadow: '0 1px 0 rgba(255,255,255,0.2) inset',
            }}
          >
            Open MCP Route
          </Link>
          <Link
            href="/.well-known/oauth-protected-resource"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0.7rem 1rem',
              borderRadius: 10,
              background: 'white',
              color: '#0b1220',
              border: '1px solid rgba(12,20,40,0.12)',
            }}
          >
            Well‑known Resource
          </Link>
        </div>
      </section>

      <footer
        style={{
          position: 'absolute',
          bottom: 12,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontSize: 12,
          color: 'rgba(11,18,32,0.55)',
          zIndex: 2,
        }}
      >
        <span>© {new Date().getFullYear()} HITL MCP</span>
      </footer>
    </main>
  );
}

function Card({ title, body }: { title: string; body: string }) {
  return (
    <div
      style={{
        background: 'linear-gradient(180deg, rgba(255,255,255,0.9), rgba(255,255,255,0.8))',
        border: '1px solid rgba(12,20,40,0.08)',
        borderRadius: 12,
        padding: '1rem',
        boxShadow: '0 4px 18px rgba(30,58,138,0.06)',
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{title}</div>
      <div style={{ opacity: 0.7 }}>{body}</div>
    </div>
  );
}
