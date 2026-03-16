import { useNavigate } from 'react-router';
import { useUIStore } from '@/stores/uiStore';

type ColorblindMode = 'none' | 'deuteranopia' | 'protanopia' | 'tritanopia';

// Extend uiStore state locally — the store will be extended to persist these in a future phase.
// For now we use local component state synced with available uiStore toggles.
import { useState } from 'react';

export function Settings() {
  const navigate = useNavigate();
  const { isMuted, showDebug, toggleMute, toggleDebug } = useUIStore();

  const [colorblindMode, setColorblindMode] = useState<ColorblindMode>('none');
  const [hapticEnabled, setHapticEnabled] = useState(true);

  return (
    <div className="page-enter flex h-full flex-col overflow-y-auto p-4">
      <header className="mb-6 flex items-center justify-between">
        <h2 className="text-lg font-bold text-accent-400">Settings</h2>
        <button
          onClick={() => navigate('/')}
          className="text-sm text-surface-300 hover:text-white"
        >
          Back
        </button>
      </header>

      <div className="flex flex-col gap-6">
        {/* Colorblind Mode */}
        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-surface-300">
            Accessibility
          </h3>
          <div className="rounded-lg border border-surface-600 bg-surface-800 p-4 shadow-[0_2px_8px_rgba(0,0,0,0.4)]">
            <label className="mb-2 block text-sm font-medium text-white">
              Colorblind Mode
            </label>
            <select
              value={colorblindMode}
              onChange={(e) => setColorblindMode(e.target.value as ColorblindMode)}
              className="w-full rounded-lg border border-surface-600 bg-surface-700 px-3 py-2 text-sm text-white focus:border-accent-500 focus:outline-none"
            >
              <option value="none">None</option>
              <option value="deuteranopia">Deuteranopia (Red-Green)</option>
              <option value="protanopia">Protanopia (Red-Green)</option>
              <option value="tritanopia">Tritanopia (Blue-Yellow)</option>
            </select>
          </div>
        </section>

        {/* Haptic Feedback */}
        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-surface-300">
            Feedback
          </h3>
          <div className="rounded-lg border border-surface-600 bg-surface-800 p-4 shadow-[0_2px_8px_rgba(0,0,0,0.4)]">
            <ToggleRow
              label="Haptic Feedback"
              description="Vibration on interactions"
              enabled={hapticEnabled}
              onToggle={() => setHapticEnabled(!hapticEnabled)}
            />
          </div>
        </section>

        {/* Audio */}
        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-surface-300">
            Audio
          </h3>
          <div className="rounded-lg border border-surface-600 bg-surface-800 p-4 shadow-[0_2px_8px_rgba(0,0,0,0.4)]">
            <ToggleRow
              label="Mute Sound"
              description="Disable all game audio"
              enabled={isMuted}
              onToggle={toggleMute}
            />
          </div>
        </section>

        {/* Developer */}
        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-surface-300">
            Developer
          </h3>
          <div className="rounded-lg border border-surface-600 bg-surface-800 p-4 shadow-[0_2px_8px_rgba(0,0,0,0.4)]">
            <ToggleRow
              label="Debug Mode"
              description="Show debug overlays and logging"
              enabled={showDebug}
              onToggle={toggleDebug}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  enabled,
  onToggle,
}: {
  label: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="text-sm font-medium text-white">{label}</div>
        <div className="text-xs text-surface-300">{description}</div>
      </div>
      <button
        onClick={onToggle}
        className={`relative h-6 w-11 rounded-full transition-colors ${
          enabled ? 'bg-accent-500' : 'bg-surface-600'
        }`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
            enabled ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}
