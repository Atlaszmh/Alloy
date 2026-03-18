import { useParams } from 'react-router';

export function Adapt() {
  const { code } = useParams();

  return (
    <div className="flex h-full flex-col p-4">
      <header className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-accent-400">Adapt Phase</h2>
        <span className="text-sm text-surface-400">Match {code}</span>
      </header>
      <div className="flex flex-1 items-center justify-center">
        <p className="text-surface-400">Review opponent's loadout and adjust your strategy</p>
      </div>
    </div>
  );
}
