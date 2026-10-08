// Round period gauges on the dash display canvas: the tachometer in the left
// square cell and the speedometer in the right one, each with a needle.
import type { CarSpec } from '@/car/car-specs';
import type { DashState } from '@/types/car-model';
import { FONT_STACK, type Ctx } from '@/car/models/livery-canvas';

export const TACH_MAX = 8000;
export const SPEEDO_MAX = 280;

/** 270 degree sweep from the lower left, clockwise over the top (canvas angles). */
const START = Math.PI * 0.75;
const SWEEP = Math.PI * 1.5;

interface Dial {
  max: number;
  major: number;
  minor: number;
  label: (v: number) => string;
  unit: string;
  sub: string;
  redFrom: number | null;
  needle: string;
}

const angle = (v: number, max: number) => START + SWEEP * Math.max(0, Math.min(1, v / max));

/** Engine speed shown on the tachometer: the dash state's rpm when given, else exact in the shift-light range and estimated from road speed and gear below it. */
export function dashRpm(spec: CarSpec, d: DashState): number {
  const e = spec.engine;
  if (d.rpm !== undefined) return d.rpm;
  const knee = e.redlineRpm - 1700;
  if (d.shiftLights > 0) return knee + Math.min(1, d.shiftLights) * 1600;
  const ratio = (d.gear > 0 ? spec.gearRatios[d.gear - 1] : d.gear < 0 ? spec.reverseRatio : 0) ?? 0;
  if (!ratio) return e.idleRpm;
  const rpm = ((Math.abs(d.speedKmh) / 3.6 / spec.dimensions.wheelRadius) * ratio * spec.finalDrive * 60) / (Math.PI * 2);
  return Math.max(e.idleRpm, Math.min(knee, rpm));
}

function dial(ctx: Ctx, x0: number, s: number, d: Dial, value: number): void {
  const cx = x0 + s / 2;
  const cy = s / 2;
  const r = s * 0.42;
  ctx.fillStyle = '#0b0c0e';
  ctx.fillRect(x0, 0, s, s);
  ctx.strokeStyle = '#2b2d31';
  ctx.lineWidth = s * 0.014;
  ctx.strokeRect(x0 + s * 0.02, s * 0.02, s * 0.96, s * 0.96);
  if (d.redFrom !== null) {
    ctx.strokeStyle = '#d8321f';
    ctx.lineWidth = s * 0.035;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.93, angle(d.redFrom, d.max), angle(d.max, d.max));
    ctx.stroke();
  }
  ctx.fillStyle = '#e9e5d3';
  ctx.strokeStyle = '#e9e5d3';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${s * 0.1}px ${FONT_STACK}`;
  for (let v = 0; v <= d.max + 1e-6; v += d.minor) {
    const major = Math.abs(v / d.major - Math.round(v / d.major)) < 1e-6;
    const a = angle(v, d.max);
    const [c, sn] = [Math.cos(a), Math.sin(a)];
    ctx.lineWidth = s * (major ? 0.016 : 0.008);
    ctx.beginPath();
    ctx.moveTo(cx + c * r * (major ? 0.8 : 0.88), cy + sn * r * (major ? 0.8 : 0.88));
    ctx.lineTo(cx + c * r * 0.98, cy + sn * r * 0.98);
    ctx.stroke();
    if (major) ctx.fillText(d.label(v), cx + c * r * 0.62, cy + sn * r * 0.62);
  }
  ctx.font = `600 ${s * 0.075}px ${FONT_STACK}`;
  ctx.fillText(d.sub, cx, cy + r * 0.3);
  ctx.fillText(d.unit, cx, cy + r * 0.5);
  const a = angle(value, d.max);
  ctx.strokeStyle = d.needle;
  ctx.lineWidth = s * 0.024;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - Math.cos(a) * r * 0.14, cy - Math.sin(a) * r * 0.14);
  ctx.lineTo(cx + Math.cos(a) * r * 0.9, cy + Math.sin(a) * r * 0.9);
  ctx.stroke();
  ctx.fillStyle = '#24262a';
  ctx.beginPath();
  ctx.arc(cx, cy, s * 0.045, 0, Math.PI * 2);
  ctx.fill();
}

/** Paints both gauges: tachometer 0-8,000 rpm (red zone from `redlineRpm`), speedometer 0-280 km/h. */
export function paintAnalogue(ctx: Ctx, redlineRpm: number, rpm: number, speedKmh: number): void {
  const s = ctx.canvas.height;
  dial(ctx, 0, s, { max: TACH_MAX, major: 1000, minor: 500, label: (v) => String(v / 1000), unit: 'RPM', sub: 'x 1000', redFrom: redlineRpm, needle: '#ff7a1a' }, rpm);
  dial(ctx, s, s, { max: SPEEDO_MAX, major: 40, minor: 20, label: String, unit: 'KM/H', sub: 'SPEED', redFrom: null, needle: '#f4f4f0' }, speedKmh);
  ctx.lineCap = 'butt';
}
