import { describe, expect, it } from 'vitest';
import { LIVERY_PRESETS, liveryNumber } from '@/car/liveries';

describe('liveryNumber', () => {
  const torana = LIVERY_PRESETS.torana;

  it('paints 05 on both white Toranas and the plain number on the others', () => {
    expect(liveryNumber(torana[0].livery)).toBe('05');
    expect(liveryNumber(torana[1].livery)).toBe('05');
    expect(liveryNumber(torana[2].livery)).toBe('9');
    expect(liveryNumber(torana[3].livery)).toBe('34');
  });

  it('leaves every Gen3 number unchanged', () => {
    for (const kind of ['camaro', 'mustang', 'supra'] as const) {
      for (const p of LIVERY_PRESETS[kind]) expect(liveryNumber(p.livery)).toBe(String(p.livery.number));
    }
  });

  it('gives every Torana preset a unique name', () => {
    const names = torana.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('uses the hdt79 pattern on Torana slot 0 only, never on a Gen3 car', () => {
    expect(torana[0].livery.pattern).toBe('hdt79');
    for (const kind of ['camaro', 'mustang', 'supra'] as const) {
      for (const p of LIVERY_PRESETS[kind]) expect(p.livery.pattern).not.toBe('hdt79');
    }
  });
});
