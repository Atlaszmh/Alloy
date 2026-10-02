import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router';
import { AppShell } from './components/AppShell';
import { MainMenu } from './pages/MainMenu';
import { Matchmaking } from './pages/Matchmaking';
import { PhaseRouter } from './pages/PhaseRouter';
import { Profile } from './pages/Profile';
import { Leaderboard } from './pages/Leaderboard';
import { Settings } from './pages/Settings';
import { GemEncyclopedia } from './pages/GemEncyclopedia';
import { DelveCamp } from './pages/DelveCamp';
import { DelveRun } from './pages/DelveRun';
import { DelveTraining } from './pages/DelveTraining';
import { DEV_LAB } from './features/delve/lab/dev-routes';
import { useAudioUnlock } from './hooks/useAudioUnlock';
import { useRouteSound } from './hooks/useRouteSound';

/** The kit gallery (Delve UI v1), in dev builds only: a production build drops it. */
const DEV_KIT = import.meta.env.DEV
  ? lazy(() => import('./features/delve/kit/KitGallery').then((m) => ({ default: m.KitGallery })))
  : null;

function MatchRedirect() {
  const { code } = useParams<{ code: string }>();
  return <Navigate to={`/match/${code}`} replace />;
}

export function App() {
  useAudioUnlock();
  useRouteSound();

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<MainMenu />} />
        <Route path="/queue" element={<Matchmaking />} />
        <Route path="/match/:code" element={<PhaseRouter />} />
        <Route path="/match/:code/*" element={<MatchRedirect />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/gems" element={<GemEncyclopedia />} />
        <Route path="/delve" element={<DelveCamp />} />
        <Route path="/delve/run" element={<DelveRun />} />
        <Route path="/delve/training" element={<DelveTraining />} />
        {DEV_KIT && (
          <Route
            path="/delve/kit"
            element={
              <Suspense fallback={null}>
                <DEV_KIT />
              </Suspense>
            }
          />
        )}
        {DEV_LAB && (
          <Route
            path="/delve/lab"
            element={
              <Suspense fallback={null}>
                <DEV_LAB />
              </Suspense>
            }
          />
        )}
      </Route>
    </Routes>
  );
}
