/**
 * Placeholder ambient backdrop for the desktop Forge HUD.
 *
 * Translated from `.superpowers/brainstorm/forge-redesign/mockup-c-hud-v2.html`:
 * the four overlapping layers (`.bg-texture`, `.bg-anvil`, `.bg-embers`,
 * `.bg-vignette`) are pure CSS — no art assets. They will be replaced by
 * real painted illustrations + particle FX in a follow-up commit. Until then
 * this component is a faithful CSS reproduction positioned absolutely behind
 * all HUD panels (z-index 0; panels sit at z-index >= 1).
 */
export function AmbientBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="hud-ambient-backdrop"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      {/* Fine metal-texture lines */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.7,
          backgroundImage:
            'repeating-linear-gradient(0deg, rgba(255,255,255,0.015) 0 1px, transparent 1px 3px),' +
            'repeating-linear-gradient(90deg, rgba(255,255,255,0.012) 0 1px, transparent 1px 4px)',
        }}
      />
      {/* Anvil silhouette — CSS clip-path stand-in */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          bottom: '22%',
          transform: 'translateX(-50%)',
          width: '52%',
          height: '27%',
          opacity: 0.4,
          filter: 'blur(0.5px)',
          background:
            'radial-gradient(ellipse 48% 16% at 50% 95%, rgba(232, 85, 58, 0.35), transparent 70%),' +
            'linear-gradient(180deg, transparent 0%, var(--color-surface-800) 60%, var(--color-surface-700) 100%)',
          clipPath:
            'polygon(15% 100%, 15% 75%, 30% 75%, 30% 50%, 40% 40%, 40% 20%, 60% 20%, 60% 40%, 70% 50%, 70% 75%, 85% 75%, 85% 100%)',
        }}
      />
      {/* Ember pinpoints */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(circle 2px at 22% 66%, rgba(232, 85, 58, 0.9), transparent 70%),' +
            'radial-gradient(circle 1.5px at 28% 54%, rgba(236, 208, 106, 0.8), transparent 70%),' +
            'radial-gradient(circle 1px at 35% 70%, rgba(232, 85, 58, 0.6), transparent 70%),' +
            'radial-gradient(circle 1.5px at 65% 63%, rgba(236, 208, 106, 0.7), transparent 70%),' +
            'radial-gradient(circle 1px at 72% 56%, rgba(232, 85, 58, 0.8), transparent 70%),' +
            'radial-gradient(circle 2px at 78% 68%, rgba(236, 208, 106, 0.6), transparent 70%),' +
            'radial-gradient(circle 1px at 48% 60%, rgba(232, 85, 58, 0.7), transparent 70%),' +
            'radial-gradient(circle 1.5px at 55% 75%, rgba(236, 208, 106, 0.5), transparent 70%)',
        }}
      />
      {/* Edge vignette */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse 67% 67% at 50% 42%, transparent 40%, rgba(0,0,0,0.5) 100%)',
        }}
      />
    </div>
  );
}
