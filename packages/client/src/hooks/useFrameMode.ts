import { useSyncExternalStore } from 'react';

export type FrameMode = 'portrait' | 'desktop';

function subscribe(onChange: () => void): () => void {
  const mo = new MutationObserver(onChange);
  mo.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-frame-mode'],
  });
  return () => mo.disconnect();
}

function getSnapshot(): FrameMode {
  const value = document.documentElement.getAttribute('data-frame-mode');
  return value === 'desktop' ? 'desktop' : 'portrait';
}

function getServerSnapshot(): FrameMode {
  return 'portrait';
}

export function useFrameMode(): FrameMode {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
