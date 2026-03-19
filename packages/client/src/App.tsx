import { Routes, Route, Navigate, useParams } from 'react-router';
import { MainMenu } from './pages/MainMenu';
import { Matchmaking } from './pages/Matchmaking';
import { PhaseRouter } from './pages/PhaseRouter';
import { Profile } from './pages/Profile';
import { RecipeBook } from './pages/RecipeBook';
import { Collection } from './pages/Collection';
import { Leaderboard } from './pages/Leaderboard';
import { Settings } from './pages/Settings';
import { useAudioUnlock } from './hooks/useAudioUnlock';
import { useRouteSound } from './hooks/useRouteSound';

function MatchRedirect() {
  const { code } = useParams<{ code: string }>();
  return <Navigate to={`/match/${code}`} replace />;
}

export function App() {
  useAudioUnlock();
  useRouteSound();

  return (
    <div className="app-shell">
      <div className="app-frame">
        <Routes>
          <Route path="/" element={<MainMenu />} />
          <Route path="/queue" element={<Matchmaking />} />
          <Route path="/match/:code" element={<PhaseRouter />} />
          <Route path="/match/:code/*" element={<MatchRedirect />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/recipes" element={<RecipeBook />} />
          <Route path="/collection" element={<Collection />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </div>
    </div>
  );
}
