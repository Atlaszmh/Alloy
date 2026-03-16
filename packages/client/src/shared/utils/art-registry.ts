// Art registry — maps affix IDs to custom gem artwork URLs.
// When custom art is available, add entries here. Components
// check this registry and fall back to emoji if no art exists.
//
// Usage (in main.tsx or startup):
//   import { registerAllGemArt } from '@/shared/utils/art-registry';
//   registerAllGemArt({
//     fire_damage: '/assets/gems/fire_damage.png',
//     cold_damage: '/assets/gems/cold_damage.png',
//   });

const artMap = new Map<string, string>();

export function registerGemArt(affixId: string, url: string): void {
  artMap.set(affixId, url);
}

export function registerAllGemArt(entries: Record<string, string>): void {
  for (const [id, url] of Object.entries(entries)) {
    artMap.set(id, url);
  }
}

export function getGemArt(affixId: string): string | null {
  return artMap.get(affixId) ?? null;
}

export function hasGemArt(affixId: string): boolean {
  return artMap.has(affixId);
}
