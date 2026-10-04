import type { LoadedData } from './loader.js';
import type {
  BiomeDef,
  DelveBalance,
  DelveData,
  DoorDef,
  GearAffixDef,
  GearBaseDef,
  LegendaryDef,
} from '../types/delve.js';
import type { GearSlot, HeroStatKey } from '../types/gear.js';
import type { ArpgData, FormDef, FusionDef, ReactionDef } from '../types/arpg.js';
import type { FormId } from '../types/ability.js';
import type { RuneDef, RuneId } from '../types/rune.js';
import type { ManaType } from '../types/mana.js';
import type { CraftingData } from '../types/crafting.js';
import type { QuestsData } from '../types/quests.js';

export class DataRegistry {
  constructor(private readonly data: LoadedData) {}

  getArpgData(): ArpgData {
    return this.data.arpg;
  }

  getForm(id: FormId): FormDef {
    const form = this.getArpgData().forms.find((f) => f.id === id);
    if (!form) throw new Error(`Form not found: ${id}`);
    return form;
  }

  /** The fusion for a pair of distinct elements, in either order. */
  getFusion(a: ManaType, b: ManaType): FusionDef | undefined {
    return this.getArpgData().fusions.find(
      (f) => f.elements.includes(a) && f.elements.includes(b) && a !== b,
    );
  }

  /** The reaction of a pair of distinct elements, in either order. */
  getReactionFor(a: ManaType, b: ManaType): ReactionDef {
    const reaction = this.getArpgData().reactions.find(
      (r) => a !== b && r.elements.includes(a) && r.elements.includes(b),
    );
    if (!reaction) throw new Error(`No reaction for ${a} + ${b}`);
    return reaction;
  }

  getReaction(id: string): ReactionDef {
    const reaction = this.getArpgData().reactions.find((r) => r.id === id);
    if (!reaction) throw new Error(`Reaction not found: ${id}`);
    return reaction;
  }

  /** Every rune (`runes.json`), in the data's order. */
  getRunes(): RuneDef[] {
    return this.getArpgData().runes;
  }

  /** A rune by id; throws for an unknown one. */
  getRune(id: RuneId): RuneDef {
    const rune = this.findRune(id);
    if (!rune) throw new Error(`Rune not found: ${id}`);
    return rune;
  }

  /** A rune by id, or undefined (a save's id the data no longer has). */
  findRune(id: RuneId): RuneDef | undefined {
    return this.getArpgData().runes.find((r) => r.id === id);
  }

  getDelveData(): DelveData {
    return this.data.delve;
  }

  /** `crafting.json`: metals, flux, shard tiers, families and the new save's kit (see the crafting spec). */
  getCraftingData(): CraftingData {
    return this.data.crafting;
  }

  /** `quests.json`: the giver, the main and side quests, and the contract templates (see the quests spec). */
  getQuestsData(): QuestsData {
    return this.data.quests;
  }

  getDelveBalance(): DelveBalance {
    return this.data.balance.delve;
  }

  getGearBase(id: string): GearBaseDef {
    const base = this.getDelveData().bases.find((b) => b.id === id);
    if (!base) throw new Error(`Gear base not found: ${id}`);
    return base;
  }

  getGearBasesForSlot(slot: GearSlot): GearBaseDef[] {
    return this.getDelveData().bases.filter((b) => b.slot === slot);
  }

  getGearAffix(stat: HeroStatKey): GearAffixDef | undefined {
    return this.getDelveData().affixes.find((a) => a.stat === stat);
  }

  getLegendary(id: string): LegendaryDef {
    const def = this.getDelveData().legendaries.find((l) => l.id === id);
    if (!def) throw new Error(`Legendary not found: ${id}`);
    return def;
  }

  getDoor(id: string): DoorDef {
    const door = this.getDelveData().doors.find((d) => d.id === id);
    if (!door) throw new Error(`Door not found: ${id}`);
    return door;
  }

  /** Biome for a depth: 5 depths per biome, cycling after the last one. */
  getBiomeForDepth(depth: number): BiomeDef {
    const biomes = this.getDelveData().biomes;
    const every = this.getDelveBalance().dive.bossEvery;
    const idx = Math.floor((Math.max(1, depth) - 1) / every) % biomes.length;
    return biomes[idx];
  }
}
