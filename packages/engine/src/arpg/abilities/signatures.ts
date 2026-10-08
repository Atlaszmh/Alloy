import type { FormId, ResolvedAbility } from '../../types/ability.js';
import type { Vec } from '../../types/arpg.js';
import type { SimCtx } from '../combat.js';
import type { FormResult } from './forms.js';

/**
 * The signature hook (see the constructs spec §4.3): a table keyed by weapon
 * base and form (`'maul:blink'`) naming a behaviour `executeForm` dispatches to
 * in place of the form's own. It ships empty; the signature phases fill it.
 */

export type SignatureKey = `${string}:${FormId}`;
export type SignatureBehaviour = (ctx: SimCtx, ab: ResolvedAbility, aim: Vec | null) => FormResult;

/** Every signature, by `<baseId>:<form>`. Empty as shipped. */
export const SIGNATURES: Partial<Record<SignatureKey, SignatureBehaviour>> = {};

/** The signature a weapon of `baseId` has for `form`, or undefined (unarmed never has one). */
export function signatureFor(baseId: string | null, form: FormId): SignatureBehaviour | undefined {
  return baseId === null ? undefined : SIGNATURES[`${baseId}:${form}`];
}

/** Test only: run `fn` with `key` bound to `behaviour`, restored after (bound or not). */
export function withSignature<T>(key: SignatureKey, behaviour: SignatureBehaviour, fn: () => T): T {
  const had = Object.prototype.hasOwnProperty.call(SIGNATURES, key);
  const before = SIGNATURES[key];
  SIGNATURES[key] = behaviour;
  try {
    return fn();
  } finally {
    if (had) SIGNATURES[key] = before;
    else delete SIGNATURES[key];
  }
}
