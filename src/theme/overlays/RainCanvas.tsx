import { useEffect, useRef } from 'react';

export function RainCanvas() {
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

    interface Drop {
      x: number;
      y: number;
      len: number;
      speed: number;
      w: number;
      r: number;
      g: number;
      b: number;
      alpha: number;
      drift: number;
      splashChance: number;
    }

    interface Splash {
      x: number;
      y: number;
      r: number;
      maxR: number;
      alpha: number;
      life: number;
      maxLife: number;
    }

    const drops: Drop[] = [];
    const splashes: Splash[] = [];

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

    function spawnDrops() {
      drops.length = 0;
      const layers = [
        { count: 70, lenMin: 12, lenMax: 22, speed: 20, w: 1.0, color: [200, 210, 225], alphaMin: 0.2, alphaMax: 0.38 },
        { count: 150, lenMin: 7, lenMax: 15, speed: 14, w: 0.7, color: [185, 195, 212], alphaMin: 0.12, alphaMax: 0.25 },
        { count: 120, lenMin: 4, lenMax: 9, speed: 9, w: 0.4, color: [170, 180, 200], alphaMin: 0.06, alphaMax: 0.15 },
      ];

      for (const layer of layers) {
        for (let i = 0; i < layer.count; i++) {
          drops.push({
            x: Math.random() * (width + 60) - 30,
            y: Math.random() * height,
            len: layer.lenMin + Math.random() * (layer.lenMax - layer.lenMin),
            speed: layer.speed + Math.random() * layer.speed * 0.4,
            w: layer.w + Math.random() * 0.15,
            r: layer.color[0],
            g: layer.color[1],
            b: layer.color[2],
            alpha: layer.alphaMin + Math.random() * (layer.alphaMax - layer.alphaMin),
            drift: 1.5 + Math.random(),
            splashChance: layer.w > 1 ? 0.3 : 0.05,
          });
        }
      }
    }

    function tick() {
      if (!active) return;

      context.clearRect(0, 0, width, height);

      for (const drop of drops) {
        context.beginPath();
        context.moveTo(drop.x, drop.y);
        context.lineTo(drop.x + drop.drift * (drop.len / drop.speed), drop.y + drop.len);
        context.strokeStyle = `rgba(${drop.r},${drop.g},${drop.b},${drop.alpha})`;
        context.lineWidth = drop.w;
        context.lineCap = 'round';
        context.stroke();

        drop.y += drop.speed;
        drop.x += drop.drift;

        if (drop.y > height) {
          if (Math.random() < drop.splashChance) {
            splashes.push({
              x: drop.x,
              y: height - 2 + Math.random() * 4,
              r: 0,
              maxR: 2 + Math.random() * 3,
              alpha: 0.2 + Math.random() * 0.15,
              life: 0,
              maxLife: 8 + Math.random() * 6,
            });
          }

          drop.y = -drop.len - Math.random() * 80;
          drop.x = Math.random() * (width + 60) - 30;
        }
      }

      for (let i = splashes.length - 1; i >= 0; i--) {
        const splash = splashes[i];
        splash.life += 1;
        splash.r = splash.maxR * (splash.life / splash.maxLife);
        const alpha = splash.alpha * (1 - splash.life / splash.maxLife);

        if (alpha <= 0 || splash.life >= splash.maxLife) {
          splashes.splice(i, 1);
          continue;
        }

        context.beginPath();
        context.ellipse(splash.x, splash.y, splash.r * 1.5, splash.r * 0.5, 0, 0, Math.PI * 2);
        context.strokeStyle = `rgba(180,190,205,${alpha})`;
        context.lineWidth = 0.5;
        context.stroke();
      }

      raf = requestAnimationFrame(tick);
    }

    resize();
    spawnDrops();
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
