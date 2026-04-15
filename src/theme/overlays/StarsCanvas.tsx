import { useEffect, useRef } from 'react';

export function StarsCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext('2d')!;
    const canvasEl = canvas;

    let width = 0;
    let height = 0;
    let active = true;
    let raf = 0;

    const colors = [
      [200, 210, 230],
      [220, 215, 200],
      [170, 195, 240],
      [240, 225, 180],
      [230, 195, 175],
    ];

    const stars: {
      x: number;
      y: number;
      baseR: number;
      r: number;
      g: number;
      b: number;
      baseAlpha: number;
      phase: number;
      speed: number;
      flickerAmp: number;
      flashPhase: number;
      flashSpeed: number;
      isBright: boolean;
    }[] = [];

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      width = window.innerWidth;
      height = window.innerHeight;
      canvasEl.width = width * dpr;
      canvasEl.height = height * dpr;
      canvasEl.style.width = `${width}px`;
      canvasEl.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function seedStars() {
      stars.length = 0;
      for (let i = 0; i < 150; i++) {
        const isBright = Math.random() < 0.12;
        const color = colors[Math.floor(Math.random() * colors.length)];
        stars.push({
          x: Math.random() * 100,
          y: Math.random() * 60,
          baseR: isBright ? 1.2 + Math.random() * 1.2 : 0.4 + Math.random() * 0.8,
          r: color[0],
          g: color[1],
          b: color[2],
          baseAlpha: isBright ? 0.5 + Math.random() * 0.3 : 0.15 + Math.random() * 0.25,
          phase: Math.random() * Math.PI * 2,
          speed: 0.3 + Math.random() * 0.8,
          flickerAmp: isBright ? 0.15 + Math.random() * 0.2 : 0.08 + Math.random() * 0.12,
          flashPhase: Math.random() * Math.PI * 2,
          flashSpeed: 0.05 + Math.random() * 0.1,
          isBright,
        });
      }
    }

    function tick(time: number) {
      if (!active) return;

      const t = time * 0.001;
      context.clearRect(0, 0, width, height);

      for (const star of stars) {
        const px = (star.x * width) / 100;
        const py = (star.y * height) / 100;
        const osc = Math.sin(star.phase + t * star.speed);
        const shimmer = Math.sin(star.phase * 3.7 + t * star.speed * 2.3) * 0.3;
        const flash = Math.pow(Math.max(0, Math.sin(star.flashPhase + t * star.flashSpeed)), 12) * 0.4;
        const alpha = Math.max(
          0.02,
          star.baseAlpha + (osc + shimmer) * star.flickerAmp + flash
        );
        const radius = star.baseR * (1 + flash * 0.5);

        context.beginPath();
        context.arc(px, py, radius, 0, Math.PI * 2);
        context.fillStyle = `rgba(${star.r},${star.g},${star.b},${alpha})`;
        context.fill();

        if (star.isBright && alpha > 0.4) {
          const glow = context.createRadialGradient(px, py, 0, px, py, radius * 3.5);
          glow.addColorStop(0, `rgba(${star.r},${star.g},${star.b},${alpha * 0.25})`);
          glow.addColorStop(1, 'transparent');
          context.beginPath();
          context.arc(px, py, radius * 3.5, 0, Math.PI * 2);
          context.fillStyle = glow;
          context.fill();
        }
      }

      raf = requestAnimationFrame(tick);
    }

    resize();
    seedStars();
    window.addEventListener('resize', resize);
    raf = requestAnimationFrame(tick);

    return () => {
      active = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={canvasRef} />;
}
