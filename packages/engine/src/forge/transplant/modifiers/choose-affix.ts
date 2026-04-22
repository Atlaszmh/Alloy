import type { TransplantContext, TransplantModifier } from '../types.js';

/** Hook for the chooseAffix path. Kept minimal: the resolver reads
 *  `ctx.chosenAffix` directly. This modifier exists as the first entry
 *  in the pipeline so future flux-driven modifiers can assume a stable
 *  insertion point. */
export const chooseAffixModifier: TransplantModifier = {
  id: 'choose-affix',
  priority: 10,
  apply(ctx: TransplantContext): TransplantContext {
    return ctx;
  },
};
