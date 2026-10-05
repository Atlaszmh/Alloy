import type { ReactNode } from 'react';
import { HUD_SCALE_RANGE, VIEW_UNITS_RANGE, useUIStore } from '@/stores/uiStore';
import { playSound } from '@/shared/utils/sound-manager';
import { Button, Chip, Dialog, Segmented } from '@/features/delve/kit';
import { arenaResolution, arenaZoom } from '@/features/delve/arena/camera';
import { version } from '../../../../package.json';

type Colorblind = 'none' | 'deuteranopia' | 'protanopia' | 'tritanopia';

const COLORBLIND: { id: Colorblind; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'deuteranopia', label: 'Deuteranopia' },
  { id: 'protanopia', label: 'Protanopia' },
  { id: 'tritanopia', label: 'Tritanopia' },
];

/** Settings → HUD scale, in percent (the spec's 80 to 125%). */
const HUD_PERCENT = HUD_SCALE_RANGE.map((v) => Math.round(v * 100));

/**
 * The Delve's Settings (from the system menu): the same `uiStore` fields as
 * the classic drawer (volumes, mute, colorblind mode), the HUD (Lean or Full),
 * the HUD scale, View distance, and the version, which the Delve has no TabBar to show.
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
          <div className="flex items-center gap-4">
            <span className="w-48 shrink-0 text-[var(--k-text)]">HUD</span>
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
          </div>
          <p className="text-[14px] text-[var(--k-text-3)]">
            Lean: the map, one objective and what you pick up; peek for the rest. Full: the purse,
            the floor and its finds always on screen.
          </p>
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
          <p className="text-[14px] text-[var(--k-text-3)]" data-testid="view-distance-value">
            {zoom.scale} px per pixel · {Number(zoom.unitsTall.toFixed(1))} units tall
          </p>
        </Section>
        <p className="text-[14px] text-[var(--k-text-3)]" data-testid="settings-version">
          Alloy v{version}
        </p>
      </div>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-[14px] uppercase tracking-[0.06em] text-[var(--k-text-3)] [font-family:var(--k-font-label)]">
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
