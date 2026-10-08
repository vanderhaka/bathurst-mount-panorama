// Panel joints of bolt-on body parts, painted into the livery atlas for every
// livery: the dark line where each flare meets the body, and the seams between
// the spoiler's centre section and its end caps.
import type { LiveryShape } from '@/car/models/livery-paint';
import { inRegion, type Ctx } from '@/car/models/livery-canvas';

const JOINT = 'rgba(8,8,10,0.85)';
/** x where the spoiler end caps meet the centre section. */
const CAP_X = 0.58;

function flareJoints(ctx: Ctx, s: LiveryShape): void {
  const f = s.profile.flares;
  if (!f) return;
  const r = s.profile.arch.radius + f.jointR;
  const foot = s.profile.curves.sillY[0][1];
  for (const side of ['sideL', 'sideR'] as const) inRegion(ctx, side, () => {
    ctx.strokeStyle = JOINT;
    ctx.lineWidth = 0.006;
    for (const zw of [s.axleZ, -s.axleZ]) {
      // Square-cut foot, then the arc over the wheel (the part above the shoulder falls outside the side region).
      ctx.beginPath();
      ctx.moveTo(zw + r, foot);
      ctx.lineTo(zw + r, s.wheelR);
      ctx.arc(zw, s.wheelR, r, 0, Math.PI);
      ctx.lineTo(zw - r, foot);
      ctx.stroke();
    }
  });
}

function spoilerSeams(ctx: Ctx, s: LiveryShape): void {
  if (!s.profile.tail.tipLift) return;
  ctx.strokeStyle = JOINT;
  ctx.lineWidth = 0.005;
  inRegion(ctx, 'top', () => {
    ctx.beginPath();
    for (const x of [CAP_X, -CAP_X]) { ctx.moveTo(s.zRear - 0.02, x); ctx.lineTo(s.zRear + 0.22, x); }
    ctx.stroke();
  });
  inRegion(ctx, 'rear', () => {
    ctx.beginPath();
    for (const x of [CAP_X, -CAP_X]) { ctx.moveTo(x, 0.84); ctx.lineTo(x, 1.15); }
    ctx.stroke();
  });
}

/** Paints the joints of the profile's bolt-on parts (no-op for profiles without them). */
export function drawBoltOnJoints(ctx: Ctx, s: LiveryShape): void {
  flareJoints(ctx, s);
  spoilerSeams(ctx, s);
}
