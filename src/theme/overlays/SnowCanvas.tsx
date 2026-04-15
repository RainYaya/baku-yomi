import { useEffect, useRef } from 'react';

export function SnowCanvas() {
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
    let time = 0;

    interface Flake {
      x: number;
      y: number;
      size: number;
      speed: number;
      wobbleAmp: number;
      wobblePhase: number;
      wobbleSpeed: number;
      alpha: number;
      baseDrift: number;
      windWeight: number;
      rotation: number;
      rotationSpeed: number;
      detail: number;
      branchScale: number;
      glow: number;
    }

    interface LayerDef {
      count: number;
      sizeMin: number;
      sizeMax: number;
      speedMin: number;
      speedMax: number;
      wobble: number;
      alphaMin: number;
      alphaMax: number;
      driftMin: number;
      driftMax: number;
      windWeight: number;
      detail: number;
      branchScale: number;
      glow: number;
    }

    const flakes: Flake[] = [];

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

    function createFlake(layer: Omit<LayerDef, 'count'>, fresh: boolean): Flake {
      const size = layer.sizeMin + Math.random() * (layer.sizeMax - layer.sizeMin);
      return {
        x: Math.random() * (width + 160) - 80,
        y: fresh ? Math.random() * height : -size * (10 + Math.random() * 18),
        size,
        speed: layer.speedMin + Math.random() * (layer.speedMax - layer.speedMin),
        wobbleAmp: layer.wobble * (0.7 + Math.random() * 0.7),
        wobblePhase: Math.random() * Math.PI * 2,
        wobbleSpeed: 0.008 + Math.random() * 0.018,
        alpha: layer.alphaMin + Math.random() * (layer.alphaMax - layer.alphaMin),
        baseDrift: layer.driftMin + Math.random() * (layer.driftMax - layer.driftMin),
        windWeight: layer.windWeight * (0.8 + Math.random() * 0.5),
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.01,
        detail: layer.detail,
        branchScale: layer.branchScale,
        glow: layer.glow,
      };
    }

    function spawnFlakes() {
      flakes.length = 0;
      const layers: LayerDef[] = [
        { count: 34, sizeMin: 3.2, sizeMax: 5.2, speedMin: 1.15, speedMax: 1.9, wobble: 0.65, alphaMin: 0.62, alphaMax: 0.82, driftMin: -0.34, driftMax: 0.34, windWeight: 1.35, detail: 2, branchScale: 1.12, glow: 0.2 },
        { count: 84, sizeMin: 1.9, sizeMax: 3.3, speedMin: 0.72, speedMax: 1.28, wobble: 0.45, alphaMin: 0.36, alphaMax: 0.62, driftMin: -0.24, driftMax: 0.24, windWeight: 1.04, detail: 1, branchScale: 0.9, glow: 0.08 },
        { count: 150, sizeMin: 0.8, sizeMax: 1.55, speedMin: 0.4, speedMax: 0.9, wobble: 0.24, alphaMin: 0.12, alphaMax: 0.32, driftMin: -0.14, driftMax: 0.15, windWeight: 0.78, detail: 0, branchScale: 0.6, glow: 0.02 },
      ];

      for (const layer of layers) {
        for (let i = 0; i < layer.count; i++) {
          flakes.push(createFlake(layer, true));
        }
      }
    }

    function getWind(tick: number) {
      const breeze = Math.sin(tick * 0.016) * 1.02 + Math.sin(tick * 0.0054 + 1.2) * 1.2;
      const gust = Math.pow((Math.sin(tick * 0.0028 - 0.8) + 1) * 0.5, 4) * 2.85;
      return breeze + gust - 0.58;
    }

    function drawSnowflake(flake: Flake, windPush: number) {
      const { x, y, size, alpha, detail, branchScale, glow, rotation } = flake;

      if (glow > 0) {
        const halo = context.createRadialGradient(x, y, 0, x, y, size * 4.5);
        halo.addColorStop(0, `rgba(255,255,255,${alpha * glow})`);
        halo.addColorStop(1, 'rgba(255,255,255,0)');
        context.beginPath();
        context.arc(x, y, size * 4.5, 0, Math.PI * 2);
        context.fillStyle = halo;
        context.fill();
      }

      context.save();
      context.translate(x, y);
      context.rotate(rotation);
      context.strokeStyle = `rgba(255,255,255,${alpha})`;
      context.fillStyle = `rgba(255,255,255,${Math.min(alpha + 0.08, 0.92)})`;
      context.lineWidth = Math.max(0.7, size * 0.25);
      context.lineCap = 'round';
      context.lineJoin = 'round';

      if (detail === 0 && Math.abs(windPush) > 0.35) {
        const trail = Math.min(14, size * 7 + Math.abs(windPush) * 4);
        context.strokeStyle = `rgba(255,255,255,${alpha * 0.65})`;
        context.lineWidth = Math.max(0.45, size * 0.18);
        context.beginPath();
        context.moveTo(-trail, trail * 0.12);
        context.lineTo(0, 0);
        context.stroke();
        context.strokeStyle = `rgba(255,255,255,${alpha})`;
        context.lineWidth = Math.max(0.7, size * 0.25);
      }

      const armLength = size * 2.6;
      const branchNear = armLength * 0.45;
      const branchFar = armLength * 0.72;
      const branchLen = size * 0.78 * branchScale;

      context.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i;
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);

        context.moveTo(0, 0);
        context.lineTo(dx * armLength, dy * armLength);

        if (detail >= 1) {
          const bx = dx * branchNear;
          const by = dy * branchNear;
          context.moveTo(bx, by);
          context.lineTo(
            bx + Math.cos(angle + Math.PI * 0.68) * branchLen,
            by + Math.sin(angle + Math.PI * 0.68) * branchLen
          );
          context.moveTo(bx, by);
          context.lineTo(
            bx + Math.cos(angle - Math.PI * 0.68) * branchLen,
            by + Math.sin(angle - Math.PI * 0.68) * branchLen
          );
        }

        if (detail >= 2) {
          const tx = dx * branchFar;
          const ty = dy * branchFar;
          context.moveTo(tx, ty);
          context.lineTo(
            tx + Math.cos(angle + Math.PI * 0.78) * branchLen * 0.75,
            ty + Math.sin(angle + Math.PI * 0.78) * branchLen * 0.75
          );
          context.moveTo(tx, ty);
          context.lineTo(
            tx + Math.cos(angle - Math.PI * 0.78) * branchLen * 0.75,
            ty + Math.sin(angle - Math.PI * 0.78) * branchLen * 0.75
          );
        }
      }

      context.stroke();
      context.beginPath();
      context.arc(0, 0, Math.max(0.45, size * 0.22), 0, Math.PI * 2);
      context.fill();
      context.restore();
    }

    function tick() {
      if (!active) return;

      context.clearRect(0, 0, width, height);
      time += 1;
      const wind = getWind(time);

      for (let i = 0; i < flakes.length; i++) {
        const flake = flakes[i];
        const sway = Math.sin(flake.wobblePhase + time * flake.wobbleSpeed) * flake.wobbleAmp;
        const windPush = wind * flake.windWeight;

        flake.y += flake.speed * (1 + Math.abs(windPush) * 0.16);
        flake.x += flake.baseDrift + sway + windPush * 1.22;
        flake.rotation += flake.rotationSpeed + windPush * 0.018;

        if (flake.y > height + flake.size * 6) {
          flakes[i] = createFlake(
            {
              sizeMin: flake.size * 0.85,
              sizeMax: flake.size * 1.05,
              speedMin: Math.max(0.2, flake.speed * 0.92),
              speedMax: flake.speed * 1.08,
              wobble: flake.wobbleAmp,
              alphaMin: Math.max(0.1, flake.alpha * 0.92),
              alphaMax: Math.min(0.9, flake.alpha * 1.05),
              driftMin: flake.baseDrift - 0.05,
              driftMax: flake.baseDrift + 0.05,
              windWeight: flake.windWeight,
              detail: flake.detail,
              branchScale: flake.branchScale,
              glow: flake.glow,
            },
            false
          );
          continue;
        }

        if (flake.x > width + 90) flake.x = -90;
        if (flake.x < -90) flake.x = width + 90;
        drawSnowflake(flake, windPush);
      }

      raf = requestAnimationFrame(tick);
    }

    resize();
    spawnFlakes();
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
