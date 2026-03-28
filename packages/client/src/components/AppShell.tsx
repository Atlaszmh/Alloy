import { useState, useCallback, useEffect } from 'react';
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
      <div className="app-frame">
        <main className="flex-1">
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
