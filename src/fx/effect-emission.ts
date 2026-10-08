import type { WheelTelemetry } from '@/physics/types';
import type { ParticleKind } from '@/fx/particle-state';

export interface EffectSettings { smoke: boolean; dust: boolean; flames: boolean; sparks: boolean; intensity: number }
export interface EffectSignals {
  gear: number; rpm: number; redline: number; throttle: number; speed: number; s: number;
  airborne: boolean; floorClearance: number;
  wheels: ReadonlyArray<Pick<WheelTelemetry, 'load' | 'slip' | 'surface'>>;
}
export interface WheelEmission { wheel: number; kind: ParticleKind; count: number; intensity: number }
export type FlameReason = 'overrun' | 'downshift';
export interface EffectPlan { wheels: WheelEmission[]; flame: number; reason: FlameReason | null; sparks: number; intensity: number }

const DEFAULTS: EffectSettings = { smoke: true, dust: true, flames: true, sparks: true, intensity: 1 };

/** DEM dip/rise and crest windows from circuit-facts.md; location alone never creates sparks. */
export function conrodHump(s: number): boolean { return (s >= 4630 && s <= 4910) || (s >= 5190 && s <= 5290); }

/** Per-car fractional rates and short exhaust pulses, independent of render randomness. */
export class EffectEmission {
  private settings = { ...DEFAULTS };
  private readonly rates = new Float64Array(12);
  private gear: number | null = null;
  private throttle = 0;
  private cooldown = 0;
  private pulse = 0;
  private flameRate = 0;
  private sparkWait = 0;
  private reason: FlameReason | null = null;
  private bursts = { overrun: 0, downshift: 0 };

  constructor(options: Partial<EffectSettings> = {}) { this.configure(options); }
  configure(options: Partial<EffectSettings>): void {
    Object.assign(this.settings, options);
    this.settings.intensity = Math.max(0, Math.min(2, Number.isFinite(this.settings.intensity) ? this.settings.intensity : 1));
    this.rates.fill(0);
    if (!this.settings.flames || !this.settings.intensity) { this.pulse = 0; this.flameRate = 0; }
  }
  reset(): void {
    this.rates.fill(0); this.gear = null; this.throttle = 0; this.cooldown = this.pulse = this.flameRate = this.sparkWait = 0;
    this.reason = null; this.bursts = { overrun: 0, downshift: 0 };
  }
  snapshot() { return { gear: this.gear, cooldown: this.cooldown, pulse: this.pulse, bursts: { ...this.bursts } }; }

  step(s: EffectSignals, elapsed: number): EffectPlan {
    const out: EffectPlan = { wheels: [], flame: 0, reason: null, sparks: 0, intensity: this.settings.intensity };
    const dt = Math.max(0, Math.min(0.1, Number.isFinite(elapsed) ? elapsed : 0));
    if (!dt) return out;
    this.cooldown = Math.max(0, this.cooldown - dt); this.sparkWait = Math.max(0, this.sparkWait - dt);
    const downshift = this.gear !== null && s.gear > 0 && this.gear > s.gear;
    const overrun = this.gear !== null && this.throttle >= 0.55 && s.throttle <= 0.08;
    if (this.settings.flames && this.settings.intensity > 0 && s.gear > 0 && s.rpm >= s.redline * 0.48 && this.cooldown === 0 && (downshift || overrun)) {
      this.reason = downshift ? 'downshift' : 'overrun'; this.bursts[this.reason]++;
      this.pulse = downshift ? 0.085 : 0.065; this.cooldown = 0.18; this.flameRate = 2;
    }
    this.gear = s.gear; this.throttle = s.throttle;
    if (this.pulse > 0) {
      this.flameRate += Math.min(this.pulse, dt) * 65;
      out.flame = Math.min(8, Math.floor(this.flameRate + 1e-9)); this.flameRate -= out.flame;
      out.reason = out.flame ? this.reason : null; this.pulse = Math.max(0, this.pulse - dt);
    }
    const speed = Math.abs(s.speed), contact = !s.airborne && this.settings.intensity > 0;
    for (let wheel = 0; wheel < Math.min(4, s.wheels.length); wheel++) {
      const w = s.wheels[wheel], at = wheel * 3;
      const road = w.surface === 'road' || w.surface === 'kerb' || w.surface === 'concrete';
      const earth = w.surface === 'grass' || w.surface === 'gravel';
      const smoke = contact && this.settings.smoke && road && w.load > 1000 && w.slip > 1.2 && speed > 3;
      const dust = contact && this.settings.dust && earth && w.load > 300 && speed > 4;
      const slip = Math.min(1, Math.max(0, (w.slip - 1.2) / 0.8)), pace = Math.min(1, speed / 28);
      this.rate(out, wheel, 'smoke', at, smoke ? 28 * slip : 0, slip, dt);
      this.rate(out, wheel, 'dust', at + 1, dust ? 24 * pace : 0, pace, dt);
      this.rate(out, wheel, 'gravel', at + 2, dust && w.surface === 'gravel' ? 14 * pace : 0, pace, dt);
    }
    if (contact && this.settings.sparks && conrodHump(s.s) && s.speed >= 72 && s.throttle >= 0.65 && Number.isFinite(s.floorClearance) && s.floorClearance <= 0.004 && s.wheels.filter((w) => w.surface === 'road' && w.load > 300).length >= 2 && this.sparkWait === 0) {
      out.sparks = Math.min(9, 3 + Math.floor(Math.max(0, -s.floorClearance) * 160)); this.sparkWait = 0.05;
    }
    return out;
  }

  private rate(out: EffectPlan, wheel: number, kind: ParticleKind, index: number, perSecond: number, intensity: number, dt: number): void {
    if (!perSecond) { this.rates[index] = 0; return; }
    this.rates[index] += perSecond * dt;
    const count = Math.floor(this.rates[index] + 1e-9); this.rates[index] -= count;
    if (count) out.wheels.push({ wheel, kind, count, intensity: Math.min(2, intensity * this.settings.intensity) });
  }
}
