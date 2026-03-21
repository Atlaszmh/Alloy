export function DisconnectOverlay({
  isDisconnected,
  secondsLeft,
}: {
  isDisconnected: boolean;
  secondsLeft: number;
}) {
  if (!isDisconnected) return null;

  const isExpiring = secondsLeft <= 5;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/70">
      <div className="flex flex-col items-center gap-4 rounded-xl bg-surface-700 p-8 shadow-lg">
        <h2 className="text-xl font-bold text-danger">Opponent Disconnected</h2>
        {secondsLeft > 0 ? (
          <>
            <p className="text-surface-300">
              Waiting for reconnect... <span className="font-mono font-bold text-white">{secondsLeft}s</span>
            </p>
            {isExpiring && (
              <p className="text-xs text-warning">
                If they don't reconnect, you win by forfeit.
              </p>
            )}
          </>
        ) : (
          <p className="text-sm font-bold text-accent-400">
            Opponent forfeited. Claiming victory...
          </p>
        )}
        <div className="h-2 w-48 overflow-hidden rounded-full bg-surface-600">
          <div
            className="h-full rounded-full bg-warning transition-all duration-1000"
            style={{ width: `${(secondsLeft / 60) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
