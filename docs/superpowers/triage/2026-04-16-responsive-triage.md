# Responsive Triage Report

**Run:** 2026-04-16, 13.6 min, 93 tests (21 passed, 72 failed)

**Total findings:** 318 (316 fail, 2 warn)

**Coverage gap:** The matrix below includes `main-menu` and `draft` only. The `forge-equip`, `forge-combine`, `duel`, and `phase-transitions` specs all timed out during their setup phase (none reached `runProbes`), because they depend on `completeDraft()` progressing through the draft phase — and the draft phase is broken badly enough on most viewports that the helper can't complete it. **This is itself a finding**: draft-phase responsiveness is a prerequisite for testing any later phase. Addressing draft's `min-size`, `overflow-y`, and `primary-action` violations first is expected to unblock forge/duel coverage.

The two `warn` findings are from the `contract-smoke` self-test (reachability + dead-space warns on a fixture deliberately missing those markers) — ignore them.

## Severity Matrix (fail counts)

| Screen \ Viewport | 2k-dci | desktop-1280 | fhd | galaxy-fold | ipad-landscape | ipad-portrait | iphone-14-pro-max | iphone-15-pro | iphone-landscape | iphone-se | pixel-7 | qhd-1440p | ultrawide |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **contract-smoke** | · | · | · | · | · | · | · | · | · | · | · | · | · |
| **draft** | 24 | 25 | 24 | 26 | 26 | 25 | 25 | 26 | 26 | 26 | 26 | · | 24 |
| **main-menu** | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |

## Top Findings by Probe

### min-size (286)
- **draft** @ galaxy-fold: gem div 78.6×78.6 below 90px floor
- **draft** @ galaxy-fold: gem div 72.1×72.1 below 90px floor
- **draft** @ galaxy-fold: gem div 66.1×66.1 below 90px floor
- **draft** @ galaxy-fold: gem div 63.0×63.0 below 90px floor
- **draft** @ galaxy-fold: gem div 63.0×63.0 below 90px floor
- **draft** @ galaxy-fold: gem div 63.0×63.0 below 90px floor
- **draft** @ galaxy-fold: gem div 63.0×63.0 below 90px floor
- **draft** @ galaxy-fold: gem div 63.0×63.0 below 90px floor
- **draft** @ galaxy-fold: gem div 63.0×63.0 below 90px floor
- **draft** @ galaxy-fold: gem div 63.0×63.0 below 90px floor
  - _(276 more)_

### overflow-y (20)
- **main-menu** @ galaxy-fold: descendants spill past .app-frame bottom (882.0): button.flex.flex-col@883.3
- **draft** @ galaxy-fold: descendants spill past .app-frame bottom (882.0): div@1165.8, div@937.7, div.relative.inline-block@932.8, div.flex.flex-col@932.8, div@932.8
- **main-menu** @ iphone-se: descendants spill past .app-frame bottom (667.0): button.flex.flex-col@668.3
- **draft** @ iphone-se: descendants spill past .app-frame bottom (667.0): div@1876.0, div@684.2, div.relative.inline-block@679.3, div.flex.flex-col@679.3, div@679.3
- **main-menu** @ iphone-15-pro: descendants spill past .app-frame bottom (852.0): button.flex.flex-col@853.3
- **draft** @ iphone-15-pro: descendants spill past .app-frame bottom (852.0): div@1165.8, div@937.7, div.relative.inline-block@932.8, div.flex.flex-col@932.8, div@932.8
- **main-menu** @ pixel-7: descendants spill past .app-frame bottom (915.0): button.flex.flex-col@916.3
- **main-menu** @ iphone-14-pro-max: descendants spill past .app-frame bottom (932.0): button.flex.flex-col@933.3
- **draft** @ pixel-7: descendants spill past .app-frame bottom (915.0): div@1107.3, div@986.0, div.relative.inline-block@981.1, div.flex.flex-col@981.1, div@981.1
- **main-menu** @ iphone-landscape: descendants spill past .app-frame bottom (393.0): div.flex.w-full@396.7, button.rounded-lg.border@396.7, button.flex.flex-col@394.3
  - _(10 more)_

### primary-action-reachable (10)
- **draft** @ galaxy-fold: primary action div off-screen (rect outside viewport 344×882)
- **draft** @ iphone-se: primary action div off-screen (rect outside viewport 375×667)
- **draft** @ iphone-se: primary action div below 36×36 touch target (measured 359.0×13.3)
- **draft** @ iphone-15-pro: primary action div off-screen (rect outside viewport 393×852)
- **draft** @ pixel-7: primary action div off-screen (rect outside viewport 412×915)
- **draft** @ iphone-14-pro-max: primary action div off-screen (rect outside viewport 430×932)
- **draft** @ iphone-landscape: primary action div off-screen (rect outside viewport 852×393)
- **draft** @ iphone-landscape: primary action div below 36×36 touch target (measured 203.1×13.3)
- **draft** @ ipad-portrait: primary action div off-screen (rect outside viewport 768×1024)
- **draft** @ ipad-landscape: primary action div off-screen (rect outside viewport 1024×768)
