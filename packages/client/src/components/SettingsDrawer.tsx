import { SettingsContent } from './SettingsContent';

interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsDrawer({ open, onClose }: SettingsDrawerProps) {
  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="absolute inset-0 z-40 bg-black/50"
        onClick={onClose}
      />
      {/* Drawer */}
      <div
        className="absolute inset-x-0 bottom-[46px] z-50 flex flex-col rounded-t-2xl border-t border-surface-500 bg-surface-800"
        style={{
          maxHeight: '60%',
          animation: 'drawer-up 0.25s ease-out',
        }}
      >
        {/* Handle bar */}
        <div className="flex justify-center py-2">
          <div className="h-1 w-10 rounded-full bg-surface-500" />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-2">
          <h2
            className="text-base font-bold text-accent-400"
            style={{ fontFamily: 'var(--font-family-display)' }}
          >
            Settings
          </h2>
          <button
            onClick={onClose}
            className="text-sm text-surface-300 hover:text-white"
          >
            Done
          </button>
        </div>
        {/* Content */}
        <div className="overflow-y-auto px-4 pb-4">
          <SettingsContent />
        </div>
      </div>
    </>
  );
}
