// Settings screen model: every Settings field, its options and help text.
// Pure (no DOM) so it can be unit-tested.
import type { Settings } from '@/types/session';

export type SettingKey = keyof Settings;

interface ChoiceField<K extends SettingKey> {
  key: K;
  kind: 'choice';
  label: string;
  help: string;
  options: ReadonlyArray<{ value: Settings[K]; label: string }>;
}

/** Numeric settings, shown as a percentage with a meter. */
export type RangeKey = 'masterVolume' | 'steerKeyboard' | 'steerPad' | 'steerTouch';

interface RangeField {
  key: RangeKey;
  kind: 'range';
  label: string;
  help: string;
  min: number;
  max: number;
  step: number;
}

const SENSITIVITY = { kind: 'range', min: 0.5, max: 2, step: 0.1 } as const;

export type SettingField = ChoiceField<SettingKey> | RangeField;

const ON_OFF = [
  { value: false, label: 'Off' },
  { value: true, label: 'On' },
] as const;

export const SETTING_GROUPS: ReadonlyArray<{ title: string; fields: SettingField[] }> = [
  {
    title: 'Driving assists',
    fields: [
      {
        key: 'racingLine',
        kind: 'choice',
        label: 'Racing line',
        help: 'Braking shows only the braking zones; Full draws the whole ideal line coloured by speed.',
        options: [
          { value: 'off', label: 'Off' },
          { value: 'braking', label: 'Braking' },
          { value: 'full', label: 'Full' },
        ],
      },
      { key: 'autoGears', kind: 'choice', label: 'Automatic gears', help: 'The gearbox shifts for you. Turn off to shift with E / Q or {A} / {X}.', options: ON_OFF },
      { key: 'tractionControl', kind: 'choice', label: 'Traction control', help: 'Cuts power when the rear tyres spin. The TC lamp lights when it works.', options: ON_OFF },
      { key: 'abs', kind: 'choice', label: 'ABS', help: 'Stops the wheels locking under hard braking. The ABS lamp lights when it works.', options: ON_OFF },
      { key: 'steeringAssist', kind: 'choice', label: 'Steering assist', help: 'Smooths keyboard steering and limits lock at high speed.', options: ON_OFF },
      {
        key: 'damage',
        kind: 'choice',
        label: 'Damage',
        help: 'Full: crashes hurt the engine, aero and steering. Visual only: the body dents, but the car drives as new. Off: no damage.',
        options: [
          { value: 'full', label: 'Full' },
          { value: 'visual', label: 'Visual only' },
          { value: 'off', label: 'Off' },
        ],
      },
    ],
  },
  {
    title: 'Steering',
    fields: [
      { key: 'steerPad', ...SENSITIVITY, label: 'Controller steering', help: 'How much the car steers for a small stick movement. Higher = more steering near the centre. Full stick is always full lock.' },
      { key: 'steerKeyboard', ...SENSITIVITY, label: 'Keyboard steering', help: 'How fast the steering turns while you hold a steering key. Higher = quicker.' },
      { key: 'steerTouch', ...SENSITIVITY, label: 'Touch steering', help: 'How far you drag your thumb for full lock. Higher = a shorter drag.' },
    ],
  },
  {
    title: 'Display',
    fields: [
      { key: 'ghost', kind: 'choice', label: 'Ghost car', help: 'Replays your best lap as a translucent car.', options: ON_OFF },
      {
        key: 'units',
        kind: 'choice',
        label: 'Speed units',
        help: 'Units for the dash and corner speeds.',
        options: [
          { value: 'kmh', label: 'km/h' },
          { value: 'mph', label: 'mph' },
        ],
      },
      {
        key: 'camera',
        kind: 'choice',
        label: 'Camera',
        help: 'Starting camera. Press C or {RB} while driving to change it.',
        options: [
          { value: 'chase', label: 'Chase' },
          { value: 'chaseFar', label: 'Chase far' },
          { value: 'bonnet', label: 'Bonnet' },
          { value: 'cockpit', label: 'Cockpit' },
          { value: 'tv', label: 'TV' },
        ],
      },
      { key: 'motionBlur', kind: 'choice', label: 'Motion blur', help: 'Subtle speed streaks on High graphics. The instruments stay sharp.', options: ON_OFF },
      { key: 'showFps', kind: 'choice', label: 'Frame rate counter', help: 'Shows frames per second under the timing panel.', options: ON_OFF },
    ],
  },
  {
    title: 'Graphics and audio',
    fields: [
      {
        key: 'quality',
        kind: 'choice',
        label: 'Graphics quality',
        help: 'Low is fastest. High adds shadows, detail and resolution.',
        options: [
          { value: 'low', label: 'Low' },
          { value: 'medium', label: 'Medium' },
          { value: 'high', label: 'High' },
        ],
      },
      {
        key: 'frameRate',
        kind: 'choice',
        label: 'Frame rate limit',
        help: 'Most frames per second. A lower limit saves battery and heat. Max follows your display.',
        options: [
          { value: 30, label: '30' },
          { value: 60, label: '60' },
          { value: 120, label: '120' },
          { value: 0, label: 'Max' },
        ],
      },
      { key: 'masterVolume', kind: 'range', label: 'Master volume', help: 'Engine, tyres and ambient sound.', min: 0, max: 1, step: 0.05 },
    ],
  },
];

export const ALL_FIELDS: SettingField[] = SETTING_GROUPS.flatMap((g) => g.fields);

/** Index of the field's current option (choice fields). */
export function optionIndex(field: ChoiceField<SettingKey>, settings: Settings): number {
  return Math.max(0, field.options.findIndex((o) => o.value === settings[field.key]));
}

/** Returns new settings with the field moved one step in `dir` (choices wrap, range clamps). */
export function adjustSetting(settings: Settings, field: SettingField, dir: -1 | 1): Settings {
  if (field.kind === 'range') {
    const v = Math.round((settings[field.key] + dir * field.step) * 100) / 100;
    return { ...settings, [field.key]: Math.max(field.min, Math.min(field.max, v)) };
  }
  const n = field.options.length;
  const next = field.options[(optionIndex(field, settings) + dir + n) % n];
  return { ...settings, [field.key]: next.value };
}

/** Position (0..1) of a range value between its min and max, for the meter. */
export function rangeFraction(field: RangeField, value: number): number {
  return (value - field.min) / (field.max - field.min);
}

/** Text shown for the field's current value. */
export function valueLabel(field: SettingField, settings: Settings): string {
  if (field.kind === 'range') return `${Math.round(settings[field.key] * 100)}%`;
  return field.options[optionIndex(field, settings)].label;
}
