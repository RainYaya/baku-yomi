import { useTheme } from './themeStore';
import { MoonCanvas } from './overlays/MoonCanvas';
import { RainCanvas } from './overlays/RainCanvas';
import { SnowCanvas } from './overlays/SnowCanvas';
import { StarsCanvas } from './overlays/StarsCanvas';

export function ThemeOverlays() {
  const { mode } = useTheme();

  return (
    <>
      <div className="theme-overlay-layer moon-overlay" aria-hidden="true">
        <div className="moon-light-beam" />
        <div className="stars-container">{mode === 'midnight' ? <StarsCanvas /> : null}</div>
        <div className="moon-canvas-wrap">
          <MoonCanvas />
        </div>
      </div>

      <div className="theme-overlay-layer rain-overlay" aria-hidden="true">
        <div className="rain-fog" />
        {mode === 'rain' ? <RainCanvas /> : null}
      </div>

      <div className="theme-overlay-layer snow-overlay" aria-hidden="true">
        <div className="snow-glow" />
        {mode === 'snow' ? <SnowCanvas /> : null}
      </div>
    </>
  );
}
