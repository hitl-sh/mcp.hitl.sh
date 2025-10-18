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
      <WireframeOrb />
      <Snowfall />

      <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '0.75rem',
            marginTop: 0,
            flexWrap: 'wrap',
            position: 'relative',
            zIndex: 2,
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
              textDecoration: 'none',
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
              textDecoration: 'none',
            }}
          >
            Well‑known Resource
          </Link>
        </div>
    </main>
  );
}
