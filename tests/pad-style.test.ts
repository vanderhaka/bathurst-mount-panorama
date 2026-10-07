import { describe, expect, it } from 'vitest';
import { fillPadText, padName, padStyleOf } from '@/input/pad-style';

describe('controller family detection', () => {
  it('recognises PlayStation controllers in the Chrome, Safari and Firefox id formats', () => {
    expect(padStyleOf('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)')).toBe('ps5');
    expect(padStyleOf('DualSense Edge Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0df2)')).toBe('ps5');
    expect(padStyleOf('Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)')).toBe('ps4');
    expect(padStyleOf('DUALSHOCK 4 Wireless Controller')).toBe('ps4');
    expect(padStyleOf('DualSense Wireless Controller')).toBe('ps5');
    expect(padStyleOf('54c-ce6-DualSense Wireless Controller')).toBe('ps5');
    expect(padStyleOf('54c-9cc-Wireless Controller')).toBe('ps4');
  });

  it('keeps the standard names for Xbox and unknown controllers', () => {
    expect(padStyleOf('Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)')).toBe('xbox');
    expect(padStyleOf('Wireless Controller')).toBe('xbox');
    expect(padStyleOf('8BitDo Pro 2 (Vendor: 2dc8 Product: 6006)')).toBe('xbox');
    expect(padStyleOf('')).toBe('xbox');
  });
});

describe('control names', () => {
  it('maps the standard names to PlayStation symbols', () => {
    expect(['A', 'B', 'X', 'Y'].map((l) => padName(l, 'ps5'))).toEqual(['✕', '○', '□', '△']);
    expect(['LB', 'RB', 'LT', 'RT', 'Menu'].map((l) => padName(l, 'ps4'))).toEqual(['L1', 'R1', 'L2', 'R2', 'Options']);
    expect(padName('View', 'ps4')).toBe('Share');
    expect(padName('View', 'ps5')).toBe('Create');
    expect(padName('DPAD', 'ps5')).toBe('DPAD');
    expect(padName('A', 'xbox')).toBe('A');
  });

  it('fills help texts for the controller family', () => {
    const t = 'Enter or {A} to confirm, Esc or {B} to go back.';
    expect(fillPadText(t, 'xbox')).toBe('Enter or A to confirm, Esc or B to go back.');
    expect(fillPadText(t, 'ps5')).toBe('Enter or ✕ to confirm, Esc or ○ to go back.');
  });
});
