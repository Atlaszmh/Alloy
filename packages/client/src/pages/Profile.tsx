import { useNavigate } from 'react-router';
import { ProfileCard } from '@/features/meta/components/ProfileCard';
import { RankBadge } from '@/features/meta/components/RankBadge';
import { MasteryTrack } from '@/features/meta/components/MasteryTrack';
import { useProfile } from '@/features/meta/hooks/useProfile';

// Mock mastery data — will be driven by backend later
const MASTERY_TRACKS = [
  { name: 'Fire Mastery', level: 3, currentXP: 240, requiredXP: 500, color: 'bg-red-500' },
  { name: 'Cold Mastery', level: 2, currentXP: 180, requiredXP: 400, color: 'bg-blue-500' },
  { name: 'Lightning Mastery', level: 1, currentXP: 80, requiredXP: 300, color: 'bg-yellow-500' },
  { name: 'Physical Mastery', level: 4, currentXP: 350, requiredXP: 600, color: 'bg-orange-500' },
  { name: 'Forging Mastery', level: 2, currentXP: 120, requiredXP: 400, color: 'bg-accent-500' },
];

export function Profile() {
  const navigate = useNavigate();
  const profile = useProfile();

  return (
    <div className="page-enter flex h-full flex-col overflow-y-auto p-4">
      <header className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-accent-400">Profile</h2>
        <button
          onClick={() => navigate('/')}
          className="text-sm text-surface-300 hover:text-white"
        >
          Back
        </button>
      </header>

      {/* Profile Card */}
      <ProfileCard
        displayName={profile.displayName}
        elo={profile.elo}
        wins={profile.wins}
        losses={profile.losses}
      />

      {/* Stats Summary */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-surface-600 bg-surface-800 p-3 text-center shadow-[0_2px_8px_rgba(0,0,0,0.4)]">
          <div className="stat-number text-2xl text-white">{profile.elo}</div>
          <div className="text-xs text-surface-300">ELO Rating</div>
        </div>
        <div className="rounded-lg border border-surface-600 bg-surface-800 p-3 text-center shadow-[0_2px_8px_rgba(0,0,0,0.4)]">
          <div className="stat-number text-2xl text-white">
            {profile.wins + profile.losses}
          </div>
          <div className="text-xs text-surface-300">Total Games</div>
        </div>
        <div className="rounded-lg border border-surface-600 bg-surface-800 p-3 text-center shadow-[0_2px_8px_rgba(0,0,0,0.4)]">
          <div className="stat-number text-2xl text-white">{profile.winRate}%</div>
          <div className="text-xs text-surface-300">Win Rate</div>
        </div>
      </div>

      {/* Rank */}
      <div className="mt-4 flex items-center gap-3 rounded-lg border border-surface-600 bg-surface-800 p-3 shadow-[0_2px_8px_rgba(0,0,0,0.4)]">
        <span className="text-sm text-surface-300">Current Rank:</span>
        <RankBadge elo={profile.elo} size="lg" />
      </div>

      {/* Win / Loss Record */}
      <div className="mt-4 flex gap-4">
        <div className="flex-1 rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-center shadow-[0_2px_8px_rgba(0,0,0,0.4)]">
          <div className="stat-number text-xl text-green-400">{profile.wins}</div>
          <div className="text-xs text-green-400/70">Wins</div>
        </div>
        <div className="flex-1 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-center shadow-[0_2px_8px_rgba(0,0,0,0.4)]">
          <div className="stat-number text-xl text-red-400">{profile.losses}</div>
          <div className="text-xs text-red-400/70">Losses</div>
        </div>
      </div>

      {/* Mastery Tracks */}
      <section className="mt-6">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-surface-300">
          Mastery Tracks
        </h3>
        <div className="flex flex-col gap-3">
          {MASTERY_TRACKS.map((track) => (
            <MasteryTrack
              key={track.name}
              name={track.name}
              level={track.level}
              currentXP={track.currentXP}
              requiredXP={track.requiredXP}
              color={track.color}
            />
          ))}
        </div>
      </section>

      {/* Match History */}
      <section className="mt-6 pb-4">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-surface-300">
          Match History
        </h3>
        {profile.matchHistory.length === 0 ? (
          <p className="text-sm italic text-surface-300">No matches played yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {[...profile.matchHistory].reverse().map((match, i) => (
              <div
                key={`${match.matchId}-${i}`}
                className={`flex items-center justify-between rounded-lg border p-3 transition-transform hover:translate-x-0.5 ${
                  match.result === 'win'
                    ? 'border-green-500/30 bg-green-500/5 hover:bg-green-500/10'
                    : match.result === 'loss'
                      ? 'border-red-500/30 bg-red-500/5 hover:bg-red-500/10'
                      : 'border-surface-600 bg-surface-800 hover:bg-surface-700'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`text-sm font-semibold ${
                      match.result === 'win'
                        ? 'text-green-400'
                        : match.result === 'loss'
                          ? 'text-red-400'
                          : 'text-surface-300'
                    }`}
                  >
                    {match.result.toUpperCase()}
                  </span>
                  <span className="text-xs text-surface-300">
                    {match.matchId.substring(0, 12)}...
                  </span>
                </div>
                <span
                  className={`stat-number text-sm ${
                    match.eloChange >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}
                >
                  {match.eloChange >= 0 ? '+' : ''}
                  {match.eloChange} ELO
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
