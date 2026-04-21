import { useState, useCallback, useEffect, useRef } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { TabBar } from './TabBar';
import { SettingsDrawer } from './SettingsDrawer';
import { DevDrawer } from './DevDrawer';
import { ConfirmLeaveDialog } from './ConfirmLeaveDialog';

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [devOpen, setDevOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDestination, setPendingDestination] = useState('/');

  // Active game: on /match/:code route (PhaseRouter handles phase detection)
  // We treat any /match/ route where phase !== 'complete' as active.
  // Since we can't easily read phase from here without gateway context,
  // we use a simpler heuristic: /match/ route = active game.
  // PostMatch will still show the confirm — acceptable trade-off for simplicity.
  const isInMatch = location.pathname.startsWith('/match/');
  const isInQueue = location.pathname === '/queue';
  const isInActiveGame = isInMatch;

  const confirmVariant = isInQueue ? 'queue' : 'match';

  // Measure app-frame height and set --frame-h on :root.
  // Why :root and not .app-frame: the responsive tokens (--gem-size, etc.)
  // are declared in @theme which emits to :root. var() substitution inside
  // a custom property resolves against the cascade of the element where
  // the property is declared — so --frame-h must live on :root for tokens
  // there to see it. Setting it on .app-frame only would leave every token
  // frozen at the 812px fallback.
  const frameRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const root = document.documentElement;
    const DESKTOP_MIN_ASPECT = 1.5; // 3:2 threshold — see 2026-04-20 spec
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      root.style.setProperty('--frame-h', `${height}px`);
      root.style.setProperty('--frame-w', `${width}px`);
      const viewportAspect = window.innerWidth / window.innerHeight;
      const mode = viewportAspect >= DESKTOP_MIN_ASPECT ? 'desktop' : 'portrait';
      root.setAttribute('data-frame-mode', mode);
    });
    ro.observe(frame);
    const onResize = () => {
      const viewportAspect = window.innerWidth / window.innerHeight;
      const mode = viewportAspect >= DESKTOP_MIN_ASPECT ? 'desktop' : 'portrait';
      root.setAttribute('data-frame-mode', mode);
    };
    window.addEventListener('resize', onResize);
    onResize();
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', onResize);
      root.style.removeProperty('--frame-h');
      root.style.removeProperty('--frame-w');
      root.removeAttribute('data-frame-mode');
    };
  }, []);

  // Close drawers on route change
  useEffect(() => {
    setSettingsOpen(false);
    setDevOpen(false);
  }, [location.pathname]);

  const handleConfirmLeave = useCallback((destination: string) => {
    setPendingDestination(destination);
    setConfirmOpen(true);
  }, []);

  const handleConfirmAccept = useCallback(() => {
    setConfirmOpen(false);
    navigate(pendingDestination);
  }, [navigate, pendingDestination]);

  return (
    <div className="app-shell">
      <div className="app-frame" ref={frameRef}>
        <main className="flex-1" style={{ minHeight: 0, overflow: 'hidden' }}>
          <Outlet />
        </main>

        <TabBar
          onSettingsOpen={() => { setDevOpen(false); setSettingsOpen(true); }}
          onDevOpen={() => { setSettingsOpen(false); setDevOpen(true); }}
          onConfirmLeave={handleConfirmLeave}
          isInActiveGame={isInActiveGame}
          isInQueue={isInQueue}
        />

        <SettingsDrawer
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
        />

        <DevDrawer
          open={devOpen}
          onClose={() => setDevOpen(false)}
        />

        <ConfirmLeaveDialog
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          onConfirm={handleConfirmAccept}
          variant={confirmVariant}
        />
      </div>
    </div>
  );
}
