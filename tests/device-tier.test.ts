import { describe, expect, it } from 'vitest';
import { defaultQualityFor, type DeviceHints } from '@/game/device-tier';

const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
const hints = (over: Partial<DeviceHints>): DeviceHints => ({ coarsePointer: false, finePointer: true, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', ...over });

describe('first-visit graphics tier', () => {
  it('starts a desktop or laptop on High', () => {
    expect(defaultQualityFor(hints({}))).toBe('high');
    expect(defaultQualityFor(hints({ deviceMemory: 8, hardwareConcurrency: 12 }))).toBe('high');
  });

  it('keeps a small laptop on High: only touch devices are judged weak', () => {
    expect(defaultQualityFor(hints({ deviceMemory: 2, hardwareConcurrency: 2 }))).toBe('high');
  });

  it('starts a phone or tablet on Medium', () => {
    expect(defaultQualityFor(hints({ coarsePointer: true, finePointer: false, userAgent: IPHONE }))).toBe('medium');
    expect(defaultQualityFor(hints({ coarsePointer: true, finePointer: false, hardwareConcurrency: 8 }))).toBe('medium');
    expect(defaultQualityFor(hints({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)', hardwareConcurrency: 8 }))).toBe('medium');
  });

  it('starts a touch laptop with a mouse on High', () => {
    expect(defaultQualityFor(hints({ coarsePointer: true, finePointer: true }))).toBe('high');
  });

  it('starts a weak phone on Low', () => {
    expect(defaultQualityFor(hints({ coarsePointer: true, finePointer: false, deviceMemory: 3 }))).toBe('low');
    expect(defaultQualityFor(hints({ userAgent: ANDROID_UA, hardwareConcurrency: 4 }))).toBe('low');
    expect(defaultQualityFor(hints({ userAgent: IPHONE, deviceMemory: 4, hardwareConcurrency: 6 }))).toBe('medium');
  });

  it('never judges an iPhone weak from its core count (Safari may report fewer cores for privacy)', () => {
    expect(defaultQualityFor(hints({ userAgent: IPHONE, hardwareConcurrency: 2 }))).toBe('medium');
    expect(defaultQualityFor(hints({ userAgent: IPHONE, hardwareConcurrency: 4 }))).toBe('medium');
  });
});
