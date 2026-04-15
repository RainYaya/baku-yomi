import { useEffect, useRef } from 'react';

export function MoonCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = canvas.width;
    const radius = size / 2;
    const cx = radius;
    const cy = radius;

    let seed = 42;
    function srand() {
      seed = (seed * 16807 + 0) % 2147483647;
      return (seed - 1) / 2147483646;
    }

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();

    const base = ctx.createRadialGradient(cx * 0.72, cy * 0.68, radius * 0.02, cx, cy, radius);
    base.addColorStop(0, '#e2ddd2');
    base.addColorStop(0.3, '#d5d0c5');
    base.addColorStop(0.65, '#c0bbb0');
    base.addColorStop(1, '#aaa59a');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);

    const maria = [
      { x: 0.36, y: 0.3, rx: 0.2, ry: 0.13, a: 0.1 },
      { x: 0.46, y: 0.54, rx: 0.15, ry: 0.11, a: 0.08 },
      { x: 0.56, y: 0.4, rx: 0.11, ry: 0.15, a: 0.07 },
      { x: 0.3, y: 0.62, rx: 0.13, ry: 0.1, a: 0.06 },
    ];

    for (const m of maria) {
      const g = ctx.createRadialGradient(
        m.x * size,
        m.y * size,
        0,
        m.x * size,
        m.y * size,
        Math.max(m.rx, m.ry) * size
      );
      g.addColorStop(0, `rgba(75, 72, 65, ${m.a})`);
      g.addColorStop(0.5, `rgba(80, 77, 70, ${m.a * 0.4})`);
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(m.x * size, m.y * size, m.rx * size, m.ry * size, srand() * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }

    const craters = [
      { x: 0.32, y: 0.28, r: 0.055 },
      { x: 0.52, y: 0.35, r: 0.035 },
      { x: 0.4, y: 0.56, r: 0.045 },
      { x: 0.6, y: 0.58, r: 0.03 },
    ];

    for (const crater of craters) {
      const px = crater.x * size;
      const py = crater.y * size;
      const pr = crater.r * size;

      const shadow = ctx.createRadialGradient(px + pr * 0.12, py + pr * 0.12, pr * 0.2, px, py, pr);
      shadow.addColorStop(0, 'rgba(50, 45, 40, 0.10)');
      shadow.addColorStop(0.8, 'rgba(50, 45, 40, 0.05)');
      shadow.addColorStop(1, 'transparent');
      ctx.fillStyle = shadow;
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(230, 225, 218, 0.06)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(px - pr * 0.06, py - pr * 0.06, pr * 0.8, -Math.PI * 0.7, Math.PI * 0.15);
      ctx.stroke();
    }

    const terminator = ctx.createLinearGradient(cx * 0.5, 0, size, 0);
    terminator.addColorStop(0, 'transparent');
    terminator.addColorStop(0.55, 'transparent');
    terminator.addColorStop(0.8, 'rgba(12, 15, 28, 0.2)');
    terminator.addColorStop(1, 'rgba(5, 8, 18, 0.55)');
    ctx.fillStyle = terminator;
    ctx.fillRect(0, 0, size, size);

    const edgeGlow = ctx.createRadialGradient(cx + radius * 0.65, cy, 0, cx + radius * 0.65, cy, radius * 0.5);
    edgeGlow.addColorStop(0, 'rgba(100, 130, 180, 0.03)');
    edgeGlow.addColorStop(1, 'transparent');
    ctx.fillStyle = edgeGlow;
    ctx.fillRect(0, 0, size, size);

    const limb = ctx.createRadialGradient(cx, cy, radius * 0.65, cx, cy, radius);
    limb.addColorStop(0, 'transparent');
    limb.addColorStop(0.85, 'rgba(25, 22, 18, 0.06)');
    limb.addColorStop(1, 'rgba(15, 12, 8, 0.18)');
    ctx.fillStyle = limb;
    ctx.fillRect(0, 0, size, size);
  }, []);

  return <canvas ref={canvasRef} width={480} height={480} />;
}
