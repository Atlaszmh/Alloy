import type { ArpgEvent } from '@alloy/engine';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { showToast } from '@/components/Toast';

/** Sounds and haptics for a frame's arena events: the dive and the Training Grounds share them. */
export function playArenaEvents(events: readonly ArpgEvent[]): void {
  for (const ev of events) {
    switch (ev.kind) {
      case 'hit':
        playSound(ev.crit ? 'crit' : 'attack');
        if (ev.crit) vibrate('light');
        break;
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
      case 'drop':
        if (ev.rarity === 'rare' || ev.rarity === 'epic') playSound('lootRare');
        else if (ev.dropKind === 'item' || ev.dropKind === 'rune') playSound('lootDrop');
        break;
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
