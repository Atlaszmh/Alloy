import type { ReactNode } from 'react';
import { HUD_SCALE_RANGE, VIEW_UNITS_RANGE, useUIStore, type FxKind } from '@/stores/uiStore';
import { playSound } from '@/shared/utils/sound-manager';
import { Button, Chip, Dialog, Segmented, TEXT_SIZES, menuScaleFor, type TextSize } from '@/features/delve/kit';
import { uiScaleFor } from '@/features/delve/kit/prompts';
import { arenaResolution, arenaZoom } from '@/features/delve/arena/camera';
import { version } from '../../../../package.json';

type Colorblind = 'none' | 'deuteranopia' | 'protanopia' | 'tritanopia';

const COLORBLIND: { id: Colorblind; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'deuteranopia', label: 'Deuteranopia' },
  { id: 'protanopia', label: 'Protanopia' },
  { id: 'tritanopia', label: 'Tritanopia' },
];

/** Settings → Text size's three choices, by their percentage. */
const TEXT_SIZE_OPTIONS: { id: TextSize; label: string; testId: string }[] = [
  { id: 'small', label: 'Small · 100%', testId: 'text-size-small' },
  { id: 'medium', label: 'Medium · 115%', testId: 'text-size-medium' },
  { id: 'large', label: 'Large · 130%', testId: 'text-size-large' },
];

/** Text size's names, for the line that says a window caps it. */
const TEXT_SIZE_LABEL: Record<TextSize, string> = { small: 'Small', medium: 'Medium', large: 'Large' };

/** Settings → Effects' sliders, each 0 (off) to 100%. */
const FX: { kind: FxKind; label: string }[] = [
  { kind: 'shake', label: 'Screen shake' },
  { kind: 'hitstop', label: 'Hit-stop' },
  { kind: 'flash', label: 'Flashes' },
];

/** Settings → HUD scale, in percent (the spec's 80 to 125%). */
const HUD_PERCENT = HUD_SCALE_RANGE.map((v) => Math.round(v * 100));

/**
 * The Delve's Settings (from the system menu): the same `uiStore` fields as
 * the classic drawer (volumes, mute, colorblind mode), the HUD (Lean or Full),
 * Text size, the HUD scale, View distance, Effects (shake, hit-stop, flashes), and the version,
 * which the Delve has no TabBar to show.
 */
export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const ui = useUIStore();
  const volume = (category: 'master' | 'sfx' | 'ui', label: string, value: number) => (
    <Slider
      id={`volume-${category}`}
      label={label}
      min={0}
      max={100}
      step={1}
      value={Math.round(value * 100)}
      shown={`${Math.round(value * 100)}%`}
      onChange={(v) => {
        ui.setVolume(category, v / 100);
        playSound('buttonClick');
      }}
    />
  );
  const hud = Math.round(ui.hudScale * 100);
  // What this window gives the chosen text size: under its full percentage, the cap (menuScaleFor).
  const w = window.innerWidth;
  const h = window.innerHeight;
  const shown = Math.round((menuScaleFor(w, h, TEXT_SIZES[ui.textSize]) / uiScaleFor(w, h)) * 100);
  const capped = shown < Math.round(TEXT_SIZES[ui.textSize] * 100) - 1 ? shown : null;
  // What View distance gives in this window: its whole scale and the units it shows.
  const zoom = arenaZoom(window.innerHeight, arenaResolution(), ui.arenaViewUnits);
  return (
    <Dialog
      title="Settings"
      onClose={onClose}
      width={600}
      testId="settings-panel"
      footer={
        <Button onClick={onClose} testId="settings-close">
          Done
        </Button>
      }
    >
      <div className="flex flex-col gap-6 text-[16px] text-[var(--k-text-2)]">
        <Section title="Audio">
          {volume('master', 'Master volume', ui.masterVolume)}
          {volume('sfx', 'Effects', ui.sfxVolume)}
          {volume('ui', 'Interface sounds', ui.uiVolume)}
          <Chip pressed={ui.isMuted} onClick={ui.toggleMute} testId="settings-mute">
            Mute all sound
          </Chip>
        </Section>
        <Section title="Colorblind mode">
          <Segmented
            aria-label="Colorblind mode"
            columns={4}
            value={ui.colorblindMode}
            onChange={(id) => ui.setColorblindMode(id)}
            options={COLORBLIND.map((c) => ({ ...c, testId: `colorblind-${c.id}` }))}
          />
        </Section>
        <Section title="Display">
          <span className="text-[var(--k-text)]">Text size</span>
          <Segmented
            aria-label="Text size"
            columns={3}
            value={ui.textSize}
            onChange={(size) => ui.setTextSize(size)}
            options={TEXT_SIZE_OPTIONS}
          />
          {capped && (
            <p className="k-note m-0" data-testid="text-size-capped">
              This window shows {TEXT_SIZE_LABEL[ui.textSize]} at {capped}%: the screens can grow no
              further here.
            </p>
          )}
          <Slider
            id="hud-scale"
            label="HUD scale"
            min={HUD_PERCENT[0]}
            max={HUD_PERCENT[1]}
            step={5}
            value={hud}
            shown={<span data-testid="hud-scale-value">{hud}%</span>}
            onChange={(v) => ui.setHudScale(v / 100)}
          />
          <Slider
            id="view-distance"
            label="View distance"
            min={VIEW_UNITS_RANGE[0]}
            max={VIEW_UNITS_RANGE[1]}
            step={1}
            value={ui.arenaViewUnits}
            shown={ui.arenaViewUnits}
            onChange={(v) => ui.setArenaViewUnits(v)}
          />
          <p className="text-[16px] text-[var(--k-text-3)]" data-testid="view-distance-value">
            {zoom.scale} px per pixel · {Number(zoom.unitsTall.toFixed(1))} units tall
          </p>
        </Section>
        <Section title="Effects">
          {FX.map(({ kind, label }) => (
            <Slider
              key={kind}
              id={`fx-${kind}`}
              label={label}
              min={0}
              max={100}
              step={10}
              value={Math.round(ui[kind] * 100)}
              shown={`${Math.round(ui[kind] * 100)}%`}
              onChange={(v) => ui.setFx(kind, v / 100)}
            />
          ))}
          <p className="k-note m-0" data-testid="fx-off-note">
            0 turns an effect off. Your system's reduced motion turns off the shake whatever this
            says.
          </p>
        </Section>
        {/* Last, full width over Done: the D-pad's way down to Done runs through it. */}
        <Section title="HUD">
          <Segmented
            aria-label="HUD"
            columns={2}
            value={ui.hudMode}
            onChange={(mode) => ui.setHudMode(mode)}
            options={[
              { id: 'lean', label: 'Lean', testId: 'hud-mode-lean' },
              { id: 'full', label: 'Full', testId: 'hud-mode-full' },
            ]}
          />
          <p className="text-[18px] text-[var(--k-text-3)]">
            Lean: the map, one objective and what you pick up; peek for the rest. Full: the purse,
            the floor and its finds always on screen.
          </p>
        </Section>
        <p className="text-[16px] text-[var(--k-text-3)]" data-testid="settings-version">
          Alloy v{version}
        </p>
      </div>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-[16px] uppercase tracking-[0.06em] text-[var(--k-text-3)] [font-family:var(--k-font-label)]">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Slider({
  id,
  label,
  min,
  max,
  step,
  value,
  shown,
  onChange,
}: {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  shown: ReactNode;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-4">
      <span className="w-48 shrink-0 text-[var(--k-text)]">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.currentTarget.value))}
        className="min-w-0 flex-1 accent-[#feae34]"
        data-testid={id}
      />
      <span className="w-16 shrink-0 text-right">{shown}</span>
    </label>
  );
}
