import { softClip } from '@/audio/dsp/math';
import { createRng, type Rng } from '@/audio/dsp/rng';

/** Normalise to a peak of `target` so one-shots have predictable loudness. */
function normalise(buf: Float32Array, target: number): Float32Array {
  let peak = 0;
  for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
  if (peak > 0) for (let i = 0; i < buf.length; i++) buf[i] *= target / peak;
  return buf;
}

/**
 * Exhaust backfire: a sharp crackle transient, a mid "bop" body and a low thump.
 * size 0 = crackle, 1 = pop, 2 = bang.
 */
export function synthPop(sampleRate: number, size: 0 | 1 | 2, rng: Rng): Float32Array {
  const dur = [0.1, 0.15, 0.22][size];
  const out = new Float32Array(Math.floor(dur * sampleRate));
  const thumpHz = [140, 105, 80][size];
  const thumpGain = [0.2, 0.7, 1.0][size];
  const bodyTau = [0.012, 0.022, 0.04][size];
  let ph = 0;
  let lp = 0;
  for (let n = 0; n < out.length; n++) {
    const t = n / sampleRate;
    const white = rng() * 2 - 1;
    lp += (0.3 - 0.1 * size) * (white - lp);
    ph += (2 * Math.PI * thumpHz * Math.exp(-t * 9)) / sampleRate;
    const thump = Math.sin(ph) * Math.exp(-t / (0.02 + 0.02 * size)) * thumpGain;
    const body = lp * Math.exp(-t / bodyTau) * 1.2;
    const snap = white * Math.exp(-t / 0.0022) * 0.8;
    out[n] = thump + body + snap;
  }
  return normalise(out, 0.9);
}

/** Gearbox shift: a dog-engagement clack, a thump and a short exhaust crack. */
export function synthShiftCrack(sampleRate: number, rng: Rng): Float32Array {
  const out = new Float32Array(Math.floor(0.12 * sampleRate));
  let prev = 0;
  for (let n = 0; n < out.length; n++) {
    const t = n / sampleRate;
    const white = rng() * 2 - 1;
    const hp = white - prev;
    prev = white;
    const click = white * Math.exp(-t / 0.0014);
    const zip = hp * Math.exp(-t / 0.014) * 0.45;
    const thump = Math.sin(2 * Math.PI * 78 * t) * Math.exp(-t / 0.03) * 0.7;
    out[n] = click + zip + thump;
  }
  return normalise(out, 0.9);
}

/** Collision: a deep body thump, a crunch of random metal bursts and a faint ring. */
export function synthImpact(sampleRate: number, seed: number): Float32Array {
  const rng = createRng(seed);
  const dur = 1.6;
  const out = new Float32Array(Math.floor(dur * sampleRate));
  let ph = 0;
  let lp = 0;
  for (let n = 0; n < out.length; n++) {
    const t = n / sampleRate;
    ph += (2 * Math.PI * (38 + 80 * Math.exp(-t * 8))) / sampleRate;
    lp += 0.04 * (rng() * 2 - 1 - lp);
    out[n] = Math.sin(ph) * Math.exp(-t / 0.22) * 0.9 + lp * Math.exp(-t / 0.18) * 6;
  }
  const bursts = 46;
  for (let b = 0; b < bursts; b++) {
    const start = Math.floor(Math.pow(rng(), 2.2) * 0.55 * sampleRate);
    const tau = 0.005 + 0.05 * rng();
    const amp = (1 - b / bursts) * (0.35 + 0.65 * rng());
    const coef = 0.15 + 0.7 * rng();
    let bl = 0;
    for (let n = 0; n < tau * 6 * sampleRate && start + n < out.length; n++) {
      bl += coef * (rng() * 2 - 1 - bl);
      out[start + n] += bl * amp * Math.exp(-n / sampleRate / tau) * 1.6;
    }
  }
  for (const [hz, tau, a] of [[780, 0.25, 0.1], [1170, 0.2, 0.08], [1890, 0.14, 0.05]]) {
    for (let n = 0; n < out.length; n++) {
      const t = n / sampleRate;
      out[n] += Math.sin(2 * Math.PI * hz * t) * Math.exp(-t / tau) * a;
    }
  }
  // Squash the crest factor so the crash is dense and loud, not just a spiky transient.
  let peak = 0;
  for (let n = 0; n < out.length; n++) peak = Math.max(peak, Math.abs(out[n]));
  for (let n = 0; n < out.length; n++) out[n] = softClip((out[n] / peak) * 3);
  return normalise(out, 0.9);
}

/** Sparse random clicks of random strength: gravel crunch when looped fast. */
export function synthCrackleLoop(sampleRate: number, seed: number, density = 900, seconds = 2): Float32Array {
  const rng = createRng(seed);
  const out = new Float32Array(Math.floor(seconds * sampleRate));
  const p = density / sampleRate;
  let lp = 0;
  for (let n = 0; n < out.length; n++) {
    const hit = rng() < p ? (rng() * 2 - 1) * (0.3 + 0.7 * rng()) : 0;
    lp += 0.5 * (hit - lp);
    out[n] = hit + lp;
  }
  return normalise(out, 0.9);
}

export type NoiseColour = 'white' | 'pink' | 'brown';

/** Seamless-enough looping noise (crossfaded ends) in white, pink or brown. */
export function synthNoise(sampleRate: number, colour: NoiseColour, seed: number, seconds = 2): Float32Array {
  const rng = createRng(seed);
  const n = Math.floor(seconds * sampleRate);
  const out = new Float32Array(n);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  let brown = 0;
  for (let i = 0; i < n; i++) {
    const w = rng() * 2 - 1;
    if (colour === 'white') out[i] = w;
    else if (colour === 'pink') {
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    } else {
      brown = (brown + 0.02 * w) / 1.02;
      out[i] = brown * 3.5;
    }
  }
  const fade = Math.floor(0.05 * sampleRate);
  for (let i = 0; i < fade; i++) {
    const a = i / fade;
    out[i] = out[i] * a + out[n - fade + i] * (1 - a);
  }
  return normalise(out.subarray(0, n - fade), 0.9).slice();
}

/**
 * Start-light beep: a pure tone with a little third harmonic (a timing-system buzz), 4 ms attack and 25 ms release
 * so it never clicks. Peak 0.8.
 */
export function synthBeep(sampleRate: number, hz: number, seconds: number): Float32Array {
  const out = new Float32Array(Math.floor(seconds * sampleRate));
  const attack = 0.004 * sampleRate, release = 0.025 * sampleRate;
  for (let n = 0; n < out.length; n++) {
    const w = (2 * Math.PI * hz * n) / sampleRate;
    const env = Math.min(1, n / attack, (out.length - n) / release);
    out[n] = 0.8 * env * (0.85 * Math.sin(w) + 0.15 * Math.sin(3 * w));
  }
  return out;
}
