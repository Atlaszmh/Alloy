import { useEffect, useState } from 'react';
import { useControlsStore } from '@/stores/controlsStore';
import { capturePadButton } from '@/features/gamepad/gamepad-hub';
import { Button, Chip, Dialog, Glyph } from '@/features/delve/kit';
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
  // Esc closes the editor through the Dialog's Back (`data-pad-back`), which the prompt runtime presses.

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
    <Chip pressed={active} onClick={onClick} className="min-w-[96px] justify-center" testId={id}>
      {active ? 'Press…' : label}
    </Chip>
  );
  const isCapturing = (kind: Capture['kind'], action: KeyAction) =>
    capturing?.kind === kind && capturing.action === action;
  const caption = 'text-[14px] uppercase tracking-[0.06em] text-[var(--k-text-3)]';

  return (
    <Dialog
      title={
        <span className="flex items-center gap-3">
          <Glyph id="controls" size={28} /> Controls
        </span>
      }
      onClose={onClose}
      width={680}
      testId="controls-panel"
      footer={
        <Button onClick={onClose} testId="controls-close">
          Close
        </Button>
      }
    >
      <div className="flex flex-col gap-4 text-[16px] text-[var(--k-text-2)]">
        <p>
          Pick a cell, then press the button or key you want (Esc cancels). If another action
          already uses it, the two swap. Changes apply at once.
        </p>

        <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 gap-y-2">
          <span className={caption}>Action</span>
          <span className={`${caption} text-center`}>Controller</span>
          <span className={`${caption} text-center`}>Keyboard</span>
          {CONTROL_ACTIONS.map((a) => (
            <div key={a} className="contents">
              <span className="text-[var(--k-text)]">{ACTION_LABELS[a]}</span>
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
              <span className="text-[var(--k-text)]">{ACTION_LABELS[a]}</span>
              <span className="text-center text-[14px]">Left stick</span>
              {cell(`bind-key-${a}`, keyLabel(cfg.keys[a]), isCapturing('key', a), () =>
                setCapturing({ kind: 'key', action: a }),
              )}
            </div>
          ))}
        </div>

        <section className="flex flex-col gap-2">
          <div className={caption}>Controller: hold to keep casting</div>
          <div className="flex flex-wrap gap-2">
            {REPEAT_ACTIONS.map((a) => (
              <Chip
                key={a}
                pressed={cfg.repeat[a]}
                onClick={() => store().setRepeat(a, !cfg.repeat[a])}
                testId={`repeat-${a}`}
              >
                {ACTION_LABELS[a]}
              </Chip>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-2">
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
          <Button onClick={copy} testId="controls-copy">
            {copied ? 'Copied' : 'Copy setup'}
          </Button>
          <Button onClick={() => store().reset()} testId="controls-reset">
            Reset to default
          </Button>
        </div>
        {text && (
          <textarea
            readOnly
            className="h-40 w-full bg-[var(--k-well)] p-2 font-mono text-[14px] text-[var(--k-text-2)]"
            value={text}
            onFocus={(e) => e.currentTarget.select()}
            data-testid="controls-text"
          />
        )}
      </div>
    </Dialog>
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
    <label className="flex items-center gap-3">
      <span className="w-56 shrink-0 text-[var(--k-text)]">{label}</span>
      <input
        type="range"
        min={limits[0]}
        max={limits[1]}
        step={0.01}
        value={value}
        onChange={(e) => onChange(Number(e.currentTarget.value))}
        className="min-w-0 flex-1 accent-[#feae34]"
        data-testid={id}
      />
      <span className="w-36 shrink-0 text-right text-[14px]">{format(value)}</span>
    </label>
  );
}
