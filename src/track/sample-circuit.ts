/** Uniform closed-loop samples, using the existing Bathurst builder's 3 m smoothing. */
export function sampleCircuit(points: readonly number[][], lengthM: number, spacingM = 4): number[][] {
  const resample = (input: readonly number[][], count: number): number[][] => {
    const lengths = input.map((a, i) => {
      const b = input[(i + 1) % input.length];
      return Math.hypot(b[0] - a[0], b[1] - a[1]);
    });
    const length = lengths.reduce((a, b) => a + b, 0), step = length / count;
    let segment = 0, start = 0;
    return Array.from({ length: count }, (_, i) => {
      const s = i * step;
      while (segment < input.length - 1 && s > start + lengths[segment]) start += lengths[segment++];
      const a = input[segment], b = input[(segment + 1) % input.length];
      const t = (s - start) / lengths[segment];
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    });
  };
  const dense = resample(points, Math.round(lengthM));
  const weights = Array.from({ length: 19 }, (_, i) => Math.exp(-((i - 9) ** 2) / 18));
  const sum = weights.reduce((a, b) => a + b, 0);
  const smooth = dense.map((_, i) => [0, 1].map(axis => weights.reduce((acc, w, k) =>
    acc + dense[(i + k - 9 + dense.length) % dense.length][axis] * w, 0) / sum));
  let smoothLength = 0;
  for (let i = 0; i < smooth.length; i++) {
    const a = smooth[i], b = smooth[(i + 1) % smooth.length];
    smoothLength += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  const scale = lengthM / smoothLength, origin = smooth[0];
  return resample(smooth, Math.round(lengthM / spacingM)).map(p => [(p[0] - origin[0]) * scale, 0, (p[1] - origin[1]) * scale]);
}
