import type { TransplantModifier } from '../types.js';
import { chooseAffixModifier } from './choose-affix.js';

export const TRANSPLANT_MODIFIERS: TransplantModifier[] = [chooseAffixModifier];
