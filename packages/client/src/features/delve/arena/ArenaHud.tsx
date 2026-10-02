// The dive HUD lives in arena/hud/ (Delve UI v1, 3a). This keeps useArenaCore's `floatPay` import
// working until the integrator points it at './hud/floatPay' and deletes this file.
export { floatPay } from './hud/floatPay';
