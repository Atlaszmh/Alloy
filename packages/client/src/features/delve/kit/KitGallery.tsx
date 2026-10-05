import { useState, type ReactElement } from 'react';
import type { Rarity } from '@alloy/engine';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import { RARITY_COLOR, RARITY_TEXT } from '../format';
import { ItemIcon } from '../ItemIcon';
import '../delve.css';
import { Bar, Button, Chip, Segmented, Stepper, Tabs } from './controls';
import { GLYPH_ART } from './glyph-art';
import { Glyph, InputGlyph, Price, PromptBar } from './glyphs';
import { PixelSprite } from './PixelSprite';
import { Dialog, Footer, Header, Panel, Screen } from './surfaces';
import { Tile } from './Tile';
import { TooltipCard, Tooltip } from './Tooltip';
import type { GlyphId, Prompt } from './types';

const RARITIES: Rarity[] = ['common', 'uncommon', 'magic', 'rare', 'epic', 'legendary'];
const BASES = [
  ...['sword', 'dagger', 'axe', 'maul', 'staff', 'wand', 'bow'],
  ...['helm', 'cuirass', 'gauntlets', 'greaves', 'amulet', 'ring'],
];
const TABS = ['loadout', 'skills', 'forge', 'codex', 'quests'] as const;
type Tab = (typeof TABS)[number];

const PROMPTS: Prompt[] = [
  { id: 'select', label: 'Select', binding: { mouse: 'click', pad: 'a' } },
  { id: 'equip', label: 'Equip', binding: { mouse: 'rmb', pad: 'a' } },
  {
    id: 'compare',
    label: 'Full compare',
    binding: { key: 'ShiftLeft', pad: 'lt', whileHeld: true },
  },
  { id: 'salvage', label: 'Salvage', binding: { key: 'Delete', pad: 'x' } },
  { id: 'apply', label: 'Apply', binding: { key: 'Enter', ctrl: true, pad: 'y' } },
  {
    id: 'menu',
    label: 'Menu',
    binding: { key: 'Escape', pad: 'b' },
    asButton: true,
    padBack: true,
  },
];

/** Dev-only: every kit piece on one 1080p board, to hold against the mockups' UI kit board. */
export function KitGallery(): ReactElement {
  const device = useInputDeviceStore((s) => s.device);
  const setDevice = useInputDeviceStore((s) => s.setDevice);
  const [tab, setTab] = useState<Tab>('loadout');
  const [rarity, setRarity] = useState<Rarity>('epic');
  const [dialog, setDialog] = useState(false);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} data-testid="kit-gallery">
      <Screen
        backdrop="wall"
        header={
          <Header
            title={
              <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Glyph id="anvil" size={40} />
                The kit
              </span>
            }
            subtitle="Delve UI v1 · dev gallery"
            nav={
              <Tabs<Tab>
                aria-label="Gallery tabs"
                level="top"
                digits
                glyphs
                value={tab}
                onChange={setTab}
                tabs={TABS.map((t) => ({ id: t, label: t, disabled: t === 'quests' }))}
              />
            }
            aside={
              <>
                <Price scrap={2412} />
                <Price links={5} />
                <Price dust={40} />
              </>
            }
          />
        }
        footer={
          <Footer prompts={PROMPTS}>
            <Chip pressed={device !== 'gamepad'} onClick={() => setDevice('keyboard')}>
              Keys
            </Chip>
            <Chip pressed={device === 'gamepad'} onClick={() => setDevice('gamepad')}>
              Pad
            </Chip>
            <Button variant="primary" size="lg" binding={{ key: 'Enter', pad: 'menu' }}>
              Delve ▸ depth 6
            </Button>
          </Footer>
        }
      >
        <div
          style={{
            height: '100%',
            boxSizing: 'border-box',
            padding: '24px 32px',
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 24,
          }}
        >
          <Panel title="Type · colour">
            <div className="k-display">Display 64</div>
            <div className="k-heading">Heading 32</div>
            <div className="k-section">Section 22</div>
            <div>Body 18 · item names, readouts</div>
            <div className="k-body-2">Body 16 · descriptions and prompts</div>
            <div className="k-caption">Caption 14 · the smallest size anywhere</div>
            <div className="k-label">Label 14 · Silkscreen</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
              {RARITIES.map((r) => (
                <span key={r} style={{ color: RARITY_TEXT[r] }}>
                  <span style={{ display: 'block', height: 28, background: RARITY_COLOR[r] }} />
                  {r}
                </span>
              ))}
            </div>
            <span className="k-label">Glyphs</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {(Object.keys(GLYPH_ART) as GlyphId[]).map((id) => (
                <Glyph key={id} id={id} size={21} title={id} />
              ))}
            </div>
            <span className="k-label">Sprites</span>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16 }}>
              <PixelSprite id="hero" scale={10} context="ui" label="Hero" />
              <PixelSprite id="hero" scale={4} context="ui" frame={1} label="Hero, frame 2" />
              <PixelSprite id="dummy" scale={4} context="ui" label="Dummy" />
            </div>
          </Panel>

          <Panel title="Controls" aside={<InputGlyph binding={{ key: 'KeyT', pad: 'view' }} />}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Button variant="primary">Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="danger">Danger</Button>
              <Button variant="go">▲ Equip best (8)</Button>
              <Button variant="quiet">Quiet</Button>
              <Button disabled>Disabled</Button>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Button size="sm" binding={{ mouse: 'rmb', pad: 'a' }}>
                Equip
              </Button>
              <Button
                size="sm"
                binding={{ key: 'Delete', pad: 'x' }}
                onClick={() => setDialog(true)}
              >
                Open a dialog
              </Button>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Chip pressed>All</Chip>
              <Chip pressed={false}>Weapons</Chip>
              <Chip pressed={false}>▲ Upgrades 8</Chip>
              <Chip pressed={false} disabled>
                Disabled
              </Chip>
            </div>
            <Segmented<Rarity>
              aria-label="Auto-salvage up to"
              value={rarity}
              onChange={setRarity}
              columns={3}
              options={RARITIES.map((r) => ({ id: r, label: r, color: RARITY_COLOR[r] }))}
            />
            <Stepper<Rarity>
              label="Rarity"
              value={rarity}
              onChange={setRarity}
              options={RARITIES.map((r) => ({ id: r, label: r, text: r }))}
              note="Left and right step it"
            />
            <Tabs<Tab>
              aria-label="Sub tabs"
              level="sub"
              size="md"
              glyphs
              value={tab}
              onChange={setTab}
              tabs={TABS.slice(0, 3).map((t) => ({
                id: t,
                label: t,
                badge: t === 'skills' ? 2 : undefined,
              }))}
            />
            <Bar
              kind="life"
              value={226}
              max={289}
              extra={{ value: 34, color: '#ead4aa' }}
              label="226 / 289"
            />
            <Bar kind="mana" value={74} max={102} label="74 / 102" />
            <Bar kind="charge" value={2} max={3} />
            <Bar kind="progress" value={6} max={10} segmented />
            <PromptBar prompts={PROMPTS.slice(0, 4)} />
          </Panel>

          <Panel title="Items · surfaces">
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
              <Tile
                rarity={null}
                label="Empty slot"
                icon={<ItemIcon baseId="helm" rarity="common" ghost />}
              />
              <Tile
                rarity="magic"
                label="Magic wand"
                icon={<ItemIcon baseId="wand" rarity="magic" />}
              />
              <Tooltip
                content={() => (
                  <TooltipCard
                    title={<span style={{ color: RARITY_TEXT.epic }}>Voidweave Plate</span>}
                    subtitle="Epic chest"
                    accent={RARITY_COLOR.epic}
                    prompts={PROMPTS.slice(1, 3)}
                  >
                    <span>Armor 41 · Life +64</span>
                  </TooltipCard>
                )}
              >
                <Tile
                  rarity="epic"
                  label="Voidweave Plate"
                  delta="up"
                  fresh
                  icon={<ItemIcon baseId="cuirass" rarity="epic" />}
                />
              </Tooltip>
              <Tile
                rarity="legendary"
                label="Ember Fang"
                delta="down"
                locked
                equipped
                selected
                icon={<ItemIcon baseId="sword" rarity="legendary" />}
              />
              <Tile
                rarity="rare"
                label="Rare bow"
                delta="potential"
                icon={<ItemIcon baseId="bow" rarity="rare" />}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 40px)', gap: 8 }}>
              {BASES.map((b, i) => (
                <ItemIcon key={b} baseId={b} rarity={RARITIES[i % 6]} size={40} />
              ))}
            </div>
            <Panel as="div" material="well" title="Well">
              A dark inset
            </Panel>
            <Panel as="div" material="glass" title="Glass">
              HUD steel
            </Panel>
            <TooltipCard
              title="Plasma Bolt"
              subtitle="move 3 of 4 · medium"
              material="glass"
              width={320}
            >
              <span>Hit 412 · Beat after 0.32 s</span>
            </TooltipCard>
          </Panel>
        </div>
      </Screen>
      {dialog && (
        <Dialog
          title="Controls"
          onClose={() => setDialog(false)}
          footer={<Button variant="primary">Save</Button>}
        >
          <p>
            A centred plate in the zoomed layer. Esc or B presses Back once the prompt runtime
            lands.
          </p>
        </Dialog>
      )}
    </div>
  );
}
