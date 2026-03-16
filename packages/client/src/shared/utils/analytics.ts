// Analytics integration stub
// In production: replace with PostHog, Mixpanel, or similar

interface AnalyticsEvent {
  name: string;
  properties?: Record<string, unknown>;
}

class AnalyticsClient {
  private enabled = false;
  private queue: AnalyticsEvent[] = [];

  init(apiKey?: string) {
    if (apiKey) {
      this.enabled = true;
      // In production: initialize PostHog/Mixpanel with apiKey
      console.log('[Analytics] Initialized');
    }
  }

  track(name: string, properties?: Record<string, unknown>) {
    const event: AnalyticsEvent = { name, properties };

    if (!this.enabled) {
      // Queue events before init, log in dev
      this.queue.push(event);
      return;
    }

    // In production: send to analytics provider
    console.log('[Analytics]', name, properties);
  }

  identify(userId: string, traits?: Record<string, unknown>) {
    if (!this.enabled) return;
    console.log('[Analytics] Identify:', userId, traits);
  }

  // Flush queued events (call after init)
  flush() {
    for (const event of this.queue) {
      this.track(event.name, event.properties);
    }
    this.queue = [];
  }
}

export const analytics = new AnalyticsClient();

// Pre-defined event helpers
export const Events = {
  matchStarted: (mode: string, aiTier?: number) =>
    analytics.track('match_started', { mode, aiTier }),

  matchCompleted: (mode: string, result: string, rounds: number) =>
    analytics.track('match_completed', { mode, result, rounds }),

  draftPick: (affixId: string, tier: number, pickOrder: number) =>
    analytics.track('draft_pick', { affixId, tier, pickOrder }),

  forgeAction: (actionKind: string, round: number) =>
    analytics.track('forge_action', { actionKind, round }),

  combinationUsed: (combinationId: string) =>
    analytics.track('combination_used', { combinationId }),

  synergyActivated: (synergyId: string) =>
    analytics.track('synergy_activated', { synergyId }),

  tutorialCompleted: (stepsViewed: number) =>
    analytics.track('tutorial_completed', { stepsViewed }),

  pageView: (page: string) =>
    analytics.track('page_view', { page }),
};
