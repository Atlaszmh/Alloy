import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router';
import { AppShell } from './components/AppShell';
import { MainMenu } from './pages/MainMenu';
import { DelveCamp } from './pages/DelveCamp';
import { DelveRun } from './pages/DelveRun';
import { DelveTraining } from './pages/DelveTraining';
import { DEV_LAB } from './features/delve/lab/dev-routes';
import { useAudioUnlock } from './hooks/useAudioUnlock';

/** The kit gallery (Delve UI v1), in dev builds only: a production build drops it. */
const DEV_KIT = import.meta.env.DEV
  ? lazy(() => import('./features/delve/kit/KitGallery').then((m) => ({ default: m.KitGallery })))
  : null;

export function App() {
  useAudioUnlock();

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<MainMenu />} />
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
