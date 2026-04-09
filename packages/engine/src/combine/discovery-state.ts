export class DiscoveryState {
  private discovered = new Set<string>();
  private attempted = new Set<string>();
  private discoveredSynergies = new Set<string>();

  get discoveredCount(): number {
    return this.discovered.size;
  }

  get attemptedCount(): number {
    return this.attempted.size;
  }

  recordDiscovery(recipeId: string): void {
    this.discovered.add(recipeId);
  }

  isDiscovered(recipeId: string): boolean {
    return this.discovered.has(recipeId);
  }

  recordAttempt(idA: string, idB: string): void {
    this.attempted.add(DiscoveryState.comboKey(idA, idB));
  }

  hasAttempted(idA: string, idB: string): boolean {
    return this.attempted.has(DiscoveryState.comboKey(idA, idB));
  }

  recordSynergyDiscovery(synergyId: string): void {
    this.discoveredSynergies.add(synergyId);
  }

  isSynergyDiscovered(synergyId: string): boolean {
    return this.discoveredSynergies.has(synergyId);
  }

  serialize(): {
    discoveredRecipes: string[];
    attemptedCombos: string[];
    discoveredSynergies: string[];
  } {
    return {
      discoveredRecipes: [...this.discovered],
      attemptedCombos: [...this.attempted],
      discoveredSynergies: [...this.discoveredSynergies],
    };
  }

  static deserialize(data: {
    discoveredRecipes: string[];
    attemptedCombos: string[];
    discoveredSynergies?: string[];
  }): DiscoveryState {
    const ds = new DiscoveryState();
    for (const r of data.discoveredRecipes) ds.discovered.add(r);
    for (const c of data.attemptedCombos) ds.attempted.add(c);
    if (data.discoveredSynergies) {
      for (const s of data.discoveredSynergies) ds.discoveredSynergies.add(s);
    }
    return ds;
  }

  static comboKey(idA: string, idB: string): string {
    return [idA, idB].sort().join('+');
  }
}
