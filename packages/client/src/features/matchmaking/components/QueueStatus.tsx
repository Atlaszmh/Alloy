interface QueueStatusProps {
  queueTime: number;
  onCancel: () => void;
}

export function QueueStatus({ queueTime, onCancel }: QueueStatusProps) {
  const minutes = Math.floor(queueTime / 60);
  const seconds = queueTime % 60;

  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-surface-600 bg-surface-800 p-6">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-surface-500 border-t-accent-500" />
      <h3 className="text-lg font-semibold text-accent-400">Finding Opponent...</h3>
      <p className="tabular-nums font-mono text-sm text-surface-400">
        {minutes}:{seconds.toString().padStart(2, '0')}
      </p>
      {queueTime >= 30 && (
        <p className="text-xs text-surface-500">Expanding search range...</p>
      )}
      {queueTime >= 60 && (
        <p className="text-xs text-warning">No opponents found. Try AI match?</p>
      )}
      <button
        onClick={onCancel}
        className="rounded-lg bg-surface-600 px-4 py-2 text-sm text-surface-400 hover:bg-surface-500"
      >
        Cancel
      </button>
    </div>
  );
}
