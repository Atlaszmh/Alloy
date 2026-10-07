import type { ArpgEvent, ArpgWorld, GearItem } from '@alloy/engine';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { showToast } from '@/components/Toast';

/** An echo's hit plays its sound at this share of the volume, through the sound's own throttle. */
export const ECHO_GAIN = 0.5;

/** A drop with a sound of its own: gear that is an upgrade as it comes (▲), or an essence. */
export type LootCue = 'upgrade' | 'essence';

/**
 * This frame's drops that sound like themselves, by drop id: an essence (its material), or gear
 * `isUpgrade` calls an upgrade as it comes (the loot plaque's own test: ▲). The `drop` event
 * carries neither; the world's drops do, under the event's id, the frame it falls.
 */
export function lootCues(
  world: ArpgWorld,
  events: readonly ArpgEvent[],
  isUpgrade?: (item: GearItem) => boolean,
): Record<number, LootCue> {
  const cues: Record<number, LootCue> = {};
  for (const e of events) {
    if (e.kind !== 'drop') continue;
    const d = world.drops.find((x) => x.id === e.dropId);
    if (d?.material?.kind === 'essence') cues[e.dropId] = 'essence';
    else if (d?.item && isUpgrade?.(d.item)) cues[e.dropId] = 'upgrade';
  }
  return cues;
}

/**
 * Sounds and haptics for a frame's arena events: the dive and the Training Grounds share them.
 * `cues` (`lootCues`) gives an upgrade or an essence drop its own sound.
 */
export function playArenaEvents(
  events: readonly ArpgEvent[],
  cues: Record<number, LootCue> = {},
): void {
  // The frame's real hits first, then its echoes, so an echo never takes a real hit's cooldown.
  for (const echo of [false, true])
    for (const ev of events) {
      if (ev.kind !== 'hit' || !!ev.echo !== echo) continue;
      // An echo's hit: quieter, and no buzz (spec §8).
      if (echo) playSound(ev.crit ? 'crit' : 'attack', ECHO_GAIN);
      else {
        playSound(ev.crit ? 'crit' : 'attack');
        if (ev.crit) vibrate('light');
      }
    }
  for (const ev of events) {
    switch (ev.kind) {
      case 'heroHit':
        if (ev.blocked) break; // Invulnerable: shown in grey, silent
        playSound(ev.dodged ? 'dodge' : 'heroHurt');
        if (!ev.dodged) vibrate('light');
        break;
      case 'reaction':
        playSound('combineMerge');
        break;
      case 'barrierBreak':
        playSound('orbRemove');
        break;
      case 'explode':
        if (ev.radius >= 2.4) playSound('forgeSlam');
        break;
      case 'death':
        if (ev.monsterKind !== 'normal') playSound('death');
        break;
      case 'drop': {
        const cue = cues[ev.dropId];
        if (cue === 'essence') playSound('lootEssence');
        else if (cue === 'upgrade') playSound('lootUpgrade');
        else if (ev.rarity === 'rare' || ev.rarity === 'epic') playSound('lootRare');
        else if (ev.dropKind === 'item' || ev.dropKind === 'rune') playSound('lootDrop');
        break;
      }
      case 'pickup':
        if (ev.dropKind === 'item') playSound('dropSuccess');
        else if (ev.dropKind === 'rune') playSound('upgradeTier');
        else if (ev.dropKind === 'orb') playSound('potion');
        break;
      case 'heal':
        if (ev.source === 'potion') playSound('potion');
        break;
      case 'revive':
        playSound('lootLegendary');
        vibrate('heavy');
        break;
      case 'heroDeath':
        playSound('defeat');
        vibrate('error');
        break;
      case 'cast':
        playSound('orbPlace');
        break;
      case 'dodge':
        vibrate('light');
        break;
      case 'perfectDodge':
        playSound('synergyActivate');
        vibrate('success');
        break;
      // The room objects (see the room objects spec), on the arena's cues.
      case 'hazardPrime':
        playSound('orbSelect');
        break;
      case 'hazardBurst':
      case 'crumble':
        playSound('forgeSlam');
        vibrate('medium');
        break;
      case 'propBreak':
        playSound('gemScatter');
        break;
      case 'wallSlam':
      case 'chargeStun':
        playSound('combineFail');
        break;
      default:
        break;
    }
  }
}

/** A "Not enough mana" toast, at most once every 1.5 s. */
export function noManaToaster(): (abilityName?: string) => void {
  let last = 0;
  return (name) => {
    const now = performance.now();
    if (now - last <= 1500) return;
    last = now;
    showToast(name ? `Not enough mana for ${name}` : 'Not enough mana');
  };
}
