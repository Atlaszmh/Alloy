import { useEffect, useRef } from 'react';
import { Application } from 'pixi.js';
import { STAGE_WIDTH, STAGE_HEIGHT } from '../pixi/DuelScene.js';

export interface UsePixiAppOptions {
  width?: number;
  height?: number;
  background?: number;
}

export function usePixiApp(
  containerRef: React.RefObject<HTMLDivElement | null>,
  options: UsePixiAppOptions = {},
): React.RefObject<Application | null> {
  const appRef = useRef<Application | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const app = new Application();
    let destroyed = false;

    app
      .init({
        width: options.width ?? STAGE_WIDTH,
        height: options.height ?? STAGE_HEIGHT,
        background: options.background ?? 0x0a0a0f,
        antialias: true,
      })
      .then(() => {
        if (destroyed) {
          app.destroy();
          return;
        }

        container.appendChild(app.canvas);
        appRef.current = app;
      });

    return () => {
      destroyed = true;
      if (appRef.current) {
        appRef.current.destroy(true);
        appRef.current = null;
      }
    };
  }, [containerRef, options.width, options.height, options.background]);

  return appRef;
}
