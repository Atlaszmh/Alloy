import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { isDiveActive } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { playSound } from '@/shared/utils/sound-manager';
import { ControlsPanel } from '@/features/controls/ControlsPanel';
import { SettingsPanel } from '@/features/delve/hub/SettingsPanel';
import { Button, Footer, Glyph, PixelSprite, Screen, usePrompts, type Prompt } from '@/features/delve/kit';
import { version } from '../../package.json';
import '@/features/delve/delve.css';

/** The stepped cyan glow under the hero on the anvil, as the paper doll draws it. */
const GLOW =
  'radial-gradient(ellipse at 50% 78%, rgba(44, 232, 245, 0.22) 0 22%, rgba(44, 232, 245, 0.08) 22% 38%, transparent 38%)';

/**
 * The title screen (`/`): the logo, the hero at the Anvil and the menu (Delve or Resume dive,
 * the Training Grounds, Controls, Settings), with the version in the corner. Enter or Menu
 * delves; A presses the focused entry; Esc and B do nothing here but close a dialog.
 */
export function TitleScreen() {
  const navigate = useNavigate();
  const active = useDelveStore((s) => isDiveActive(s.profile));
  const [dialog, setDialog] = useState<'controls' | 'settings' | null>(null);
  const mainRef = useRef<HTMLDivElement>(null);

  const onDelve = () => {
    playSound('phaseTransition');
    navigate(active ? '/delve/run' : '/delve');
  };
  const delveLabel = active ? 'Resume dive' : 'Delve';
  const prompts: Prompt[] = [
    { id: 'select', label: 'Select', binding: { key: 'Enter', pad: 'a' } },
  ];
  // Enter with nothing focused, or Menu on the pad, delves (a focused entry keeps Enter and A).
  usePrompts(
    [{ id: 'delve', label: delveLabel, binding: { key: 'Enter', pad: 'menu' }, onPress: onDelve }],
    mainRef,
  );

  return (
    <div className="delve-page delve-ui" data-testid="title-screen">
      <Screen
        backdrop="wall"
        headerStyle="bare"
        header={null}
        footer={
          <Footer prompts={prompts}>
            <span className="k-label" data-testid="title-version">
              Alloy v{version}
            </span>
          </Footer>
        }
      >
        <div ref={mainRef} className="flex h-full items-center justify-center gap-[140px]">
          <div
            className="flex flex-col items-center justify-end px-10 pb-2"
            style={{ background: GLOW }}
          >
            <PixelSprite id="hero" scale={14} context="ui" label="Your hero at the Anvil" />
            <span aria-hidden className="-mt-2">
              <Glyph id="anvil" size={224} />
            </span>
          </div>
          <div className="flex w-[460px] flex-col items-center">
            <h1 className="k-title-logo">ALLOY</h1>
            <p className="k-title-line">Delve. Loot. Forge. Repeat.</p>
            <nav aria-label="Title menu" className="mt-12 flex w-full flex-col gap-4">
              <Button
                variant="primary"
                size="lg"
                onClick={onDelve}
                binding={{ key: 'Enter', pad: 'menu' }}
                data-pad-first
                data-primary-action="delve"
                testId="menu-delve"
              >
                {delveLabel}
              </Button>
              <Button onClick={() => navigate('/delve/training')} testId="menu-training">
                <Glyph id="training" size={20} /> Training Grounds
              </Button>
              <Button onClick={() => setDialog('controls')} testId="open-controls">
                <Glyph id="controls" size={20} /> Controls
              </Button>
              <Button onClick={() => setDialog('settings')} testId="open-settings">
                <Glyph id="settings" size={20} /> Settings
              </Button>
            </nav>
          </div>
        </div>
      </Screen>
      {dialog === 'controls' && <ControlsPanel onClose={() => setDialog(null)} />}
      {dialog === 'settings' && <SettingsPanel onClose={() => setDialog(null)} />}
    </div>
  );
}
