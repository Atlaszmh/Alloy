import { Routes, Route } from 'react-router';
import { MainMenu } from './pages/MainMenu';
import { Matchmaking } from './pages/Matchmaking';
import { MatchEntry } from './pages/MatchEntry';
import { Draft } from './pages/Draft';
import { Forge } from './pages/Forge';
import { Duel } from './pages/Duel';
import { Adapt } from './pages/Adapt';
import { PostMatch } from './pages/PostMatch';
import { Profile } from './pages/Profile';
import { RecipeBook } from './pages/RecipeBook';
import { Collection } from './pages/Collection';
import { Leaderboard } from './pages/Leaderboard';
import { Settings } from './pages/Settings';

export function App() {
  return (
    <div className="app-shell">
      <div className="app-frame">
        <Routes>
          <Route path="/" element={<MainMenu />} />
          <Route path="/queue" element={<Matchmaking />} />
          <Route path="/match/:code" element={<MatchEntry />} />
          <Route path="/match/:code/draft" element={<Draft />} />
          <Route path="/match/:code/forge" element={<Forge />} />
          <Route path="/match/:code/duel" element={<Duel />} />
          <Route path="/match/:code/adapt" element={<Adapt />} />
          <Route path="/match/:code/result" element={<PostMatch />} />
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
