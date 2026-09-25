import { useEffect, useState } from 'react';
import { useControlsStore } from '@/stores/controlsStore';
import { capturePadButton } from '@/features/gamepad/gamepad-hub';
import {
  ACTION_LABELS,
  AIM_REACH_LIMITS,
  CONTROL_ACTIONS,
  DEADZONE_LIMITS,
  MOVE_KEYS,
  REPEAT_ACTIONS,
  exportControls,
  keyLabel,
  padLabel,
  type ControlAction,
  type KeyAction,
} from './controls';

type Capture = { kind: 'pad'; action: ControlAction } | { kind: 'key'; action: KeyAction };

/**
 * The Controls editor: rebind the controller and the keyboard, tune the
 * sticks, then copy the setup (to send over and make it the default).
 */
export function ControlsPanel({ onClose }: { onClose: () => void }) {
  const cfg = useControlsStore((s) => s.config);
  const store = useControlsStore.getState;
  const [capturing, setCapturing] = useState<Capture | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Capture the next pad button or key for the chosen action (Esc cancels a key capture).
  useEffect(() => {
    if (!capturing) return;
    if (capturing.kind === 'pad') {
      return capturePadButton((button) => {
        store().setPad(capturing.action, button);
        setCapturing(null);
      });
    }
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code !== 'Escape') store().setKey(capturing.action, e.code);
      setCapturing(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [capturing, store]);

  // Esc closes the editor (and doesn't reach the game's menu key).
  useEffect(() => {
    if (capturing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [capturing, onClose]);

  const copy = () => {
    const setup = exportControls(store().config);
    setText(setup);
    setCopied(false);
    navigator.clipboard
      ?.writeText(setup)
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  };

  const cell = (id: string, label: string, active: boolean, onClick: () => void) => (
    <button
      type="button"
      className="delve-chip min-w-[76px] justify-center"
      aria-pressed={active}
      onClick={onClick}
      data-testid={id}
    >
      {active ? 'Press…' : label}
    </button>
  );
  const isCapturing = (kind: Capture['kind'], action: KeyAction) =>
    capturing?.kind === kind && capturing.action === action;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-3"
      data-pad-scope
      data-testid="controls-panel"
    >
      <div className="delve-panel flex w-full max-w-[520px] flex-col gap-3 p-3">
        <div className="flex items-center justify-between">
          <span className="delve-display text-lg font-bold uppercase tracking-widest text-amber-300">
            🎮 Controls
          </span>
          <button
            type="button"
            className="delve-btn px-3 py-1 text-sm"
            onClick={onClose}
            data-pad-back
            data-testid="controls-close"
          >
            Close
          </button>
        </div>
        <p className="text-[11px] text-stone-400">
          Pick a cell, then press the button or key you want (Esc cancels). If another action
          already uses it, the two swap. Changes apply at once.
        </p>

        <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-2 gap-y-1.5 text-sm">
          <span className="text-[10px] uppercase tracking-widest text-stone-500">Action</span>
          <span className="text-center text-[10px] uppercase tracking-widest text-stone-500">
            Controller
          </span>
          <span className="text-center text-[10px] uppercase tracking-widest text-stone-500">
            Keyboard
          </span>
          {CONTROL_ACTIONS.map((a) => (
            <div key={a} className="contents">
              <span className="text-stone-200">{ACTION_LABELS[a]}</span>
              {cell(`bind-pad-${a}`, padLabel(cfg.pad[a]), isCapturing('pad', a), () =>
                setCapturing({ kind: 'pad', action: a }),
              )}
              {cell(
                `bind-key-${a}`,
                a === 'attack' && !cfg.keys.attack ? 'Click' : keyLabel(cfg.keys[a]),
                isCapturing('key', a),
                () => setCapturing({ kind: 'key', action: a }),
              )}
            </div>
          ))}
          {MOVE_KEYS.map((a) => (
            <div key={a} className="contents">
              <span className="text-stone-200">{ACTION_LABELS[a]}</span>
              <span className="text-center text-[11px] text-stone-500">Left stick</span>
              {cell(`bind-key-${a}`, keyLabel(cfg.keys[a]), isCapturing('key', a), () =>
                setCapturing({ kind: 'key', action: a }),
              )}
            </div>
          ))}
        </div>

        <section className="flex flex-col gap-1.5">
          <div className="text-[10px] uppercase tracking-widest text-stone-500">
            Controller: hold to keep casting
          </div>
          <div className="flex flex-wrap gap-1.5">
            {REPEAT_ACTIONS.map((a) => (
              <button
                key={a}
                type="button"
                className="delve-chip"
                aria-pressed={cfg.repeat[a]}
                onClick={() => store().setRepeat(a, !cfg.repeat[a])}
                data-testid={`repeat-${a}`}
              >
                {ACTION_LABELS[a]}
              </button>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-2 text-sm">
          <Slider
            id="deadzone-left"
            label="Move stick deadzone"
            value={cfg.deadzone.left}
            limits={DEADZONE_LIMITS.left}
            format={(v) => v.toFixed(2)}
            onChange={(v) => store().setDeadzone('left', v)}
          />
          <Slider
            id="deadzone-right"
            label="Aim stick deadzone"
            value={cfg.deadzone.right}
            limits={DEADZONE_LIMITS.right}
            format={(v) => v.toFixed(2)}
            onChange={(v) => store().setDeadzone('right', v)}
          />
          <Slider
            id="aim-reach"
            label="Placed abilities at full tilt"
            value={cfg.aimReach}
            limits={AIM_REACH_LIMITS}
            format={(v) => `${Math.round(v * 100)}% of range`}
            onChange={(v) => store().setAimReach(v)}
          />
        </section>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="delve-btn text-sm"
            onClick={copy}
            data-testid="controls-copy"
          >
            {copied ? 'Copied ✓' : 'Copy setup'}
          </button>
          <button
            type="button"
            className="delve-btn text-sm"
            onClick={() => store().reset()}
            data-testid="controls-reset"
          >
            Reset to default
          </button>
        </div>
        {text && (
          <textarea
            readOnly
            className="h-40 w-full rounded bg-black/60 p-2 font-mono text-[10px] text-stone-300"
            value={text}
            onFocus={(e) => e.currentTarget.select()}
            data-testid="controls-text"
          />
        )}
      </div>
    </div>
  );
}

function Slider({
  id,
  label,
  value,
  limits,
  format,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  limits: readonly [number, number];
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="w-44 shrink-0 text-stone-300">{label}</span>
      <input
        type="range"
        min={limits[0]}
        max={limits[1]}
        step={0.01}
        value={value}
        onChange={(e) => onChange(Number(e.currentTarget.value))}
        className="min-w-0 flex-1"
        data-testid={id}
      />
      <span className="w-28 shrink-0 text-right text-xs text-stone-400">{format(value)}</span>
    </label>
  );
}
