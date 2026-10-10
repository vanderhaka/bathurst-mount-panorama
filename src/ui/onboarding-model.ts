// First race setup model. Step 1: a driving level card (Casual, Experienced, Superstar or Custom) and
// the rule rows that card shows. Step 2: camera and graphics, plus pedals and auto-throttle on a touch screen.
// Pure (no DOM) so it can be unit-tested.
// Every answer is an ordinary Settings value; the Settings screen stays the one place to change it later.
import { applyLevel, EXPERIENCED_CHOICES, LEVEL_NAMES, lapLevel, type LevelChoice, type RULE_KEYS } from '@/race/driving-levels';
import type { Settings } from '@/types/session';
import { SETTING_GROUPS, type SettingField } from '@/ui/settings-model';

export type OnboardingKey = 'camera' | 'graphics' | 'pedals' | 'touchAutoThrottle' | (typeof RULE_KEYS)[number];

export interface OnboardingOption {
  value: unknown;
  label: string;
  help: string;
}

export interface OnboardingRow {
  key: OnboardingKey;
  label: string;
  /** A SETTING_GROUPS title. */
  settingsTab: string;
  options: readonly OnboardingOption[];
}

const CAMERA_TIP = ' Press C or {RB} while you drive to change it.';

/** Step 2: camera and graphics. */
export const ONBOARDING_ROWS: readonly OnboardingRow[] = [
  {
    key: 'camera',
    label: 'Camera',
    settingsTab: 'Display',
    options: [
      { value: 'chase', label: 'Chase', help: `Behind the car. The easiest view for a new driver.${CAMERA_TIP}` },
      { value: 'bonnet', label: 'Bonnet', help: `Low on the bonnet, with a clear view of the road.${CAMERA_TIP}` },
      { value: 'cockpit', label: 'Cockpit', help: `From the driver's seat.${CAMERA_TIP}` },
    ],
  },
  {
    key: 'graphics',
    label: 'Graphics',
    settingsTab: 'Graphics and audio',
    options: [
      { value: 'auto', label: 'Auto', help: 'Starts on High. In the first ten seconds of a race, it lowers the detail if the frame rate is too low.' },
      { value: 'low', label: 'Low', help: 'Fastest, with less detail and a lower resolution. Saves battery on a phone.' },
      { value: 'medium', label: 'Medium', help: 'Good detail at a steady frame rate on most devices.' },
      { value: 'high', label: 'High', help: 'Most detail and the highest resolution. Needs a fast device.' },
    ],
  },
];

/** Step 2 on a touch screen only: how the on-screen pedals work. Pedals sets the analog throttle and brake together. */
export const TOUCH_ROWS: readonly OnboardingRow[] = [
  {
    key: 'pedals',
    label: 'Pedals',
    settingsTab: 'Steering',
    options: [
      { value: 'onoff', label: 'On/off', help: 'Any touch is full throttle or full braking. The simplest to start with.' },
      { value: 'analog', label: 'Analog', help: 'Thumb height sets the amount, for throttle and brake: bottom = gentle, top = full.' },
    ],
  },
  {
    key: 'touchAutoThrottle',
    label: 'Auto throttle',
    settingsTab: 'Steering',
    options: [
      { value: false, label: 'Off', help: 'You press the throttle pedal yourself.' },
      { value: true, label: 'On', help: 'The car accelerates for you. Touch Brake to cut power and slow down.' },
    ],
  },
];

const CAMERA_LABELS: Readonly<Record<Settings['camera'], string>> = { chase: 'Chase', chaseFar: 'Chase far', bonnet: 'Bonnet', cockpit: 'Cockpit', tv: 'TV' };

export const ONBOARDING_LATER = 'You can change all of these at any time in Settings.';
export const LEVEL_RECORDS_NOTE = 'Each level keeps its own best laps and ghost.';

export function needsOnboarding(settings: Pick<Settings, 'onboarded'>): boolean {
  return !settings.onboarded;
}

/** The card order, left to right. */
export const LEVEL_CARDS: readonly LevelChoice[] = ['casual', 'experienced', 'superstar', 'custom'];

/** Up to three short facts on each card. */
export const LEVEL_FACTS: Readonly<Record<LevelChoice, readonly string[]>> = {
  casual: ['Full racing line and every help', 'No damage, track limits or wear', 'Back on track after a spin'],
  experienced: ['Racing line in the braking zones', 'Traction control, ABS, steering assist', 'Track limits, wear and damage'],
  superstar: ['No racing line, automatic gears', 'No traction control or ABS', 'Full damage, track limits and wear'],
  custom: ['Choose every rule yourself', 'Laps count for the highest level your rules allow'],
};

/** Picks a card: a level applies its rules, Custom keeps the draft's rules. */
export function selectLevel(draft: Settings, choice: LevelChoice): Settings {
  return choice === 'custom' ? draft : applyLevel(draft, choice);
}

/** The live line on the Custom card. */
export function lapLevelLine(settings: Settings): string {
  return `Your laps count as: ${LEVEL_NAMES[lapLevel(settings)].badge}`;
}

type ChoiceField = Extract<SettingField, { kind: 'choice' }>;

function ruleRow(field: ChoiceField, allowed?: readonly unknown[]): OnboardingRow {
  // Allowed values keep the order given (Braking before Off); a full list keeps the Settings order.
  const picked = allowed ? allowed.flatMap((v) => field.options.filter((o) => o.value === v)) : field.options;
  const options = picked.map((o) => ({ value: o.value, label: o.label, help: field.help }));
  return { key: field.key as OnboardingKey, label: field.label, settingsTab: 'Driving assists', options };
}

const ASSIST_FIELDS: readonly ChoiceField[] = (SETTING_GROUPS.find((g) => g.title === 'Driving assists')?.fields ?? []).filter((f): f is ChoiceField => f.kind === 'choice');

/** Custom: every rule, with every option. */
export const CUSTOM_ROWS: readonly OnboardingRow[] = ASSIST_FIELDS.map((f) => ruleRow(f));

/** Experienced: the three rules it lets the player choose, with only the values it allows. */
export const EXPERIENCED_ROWS: readonly OnboardingRow[] = (['racingLine', 'autoGears', 'damage'] as const).map((key) => {
  const field = ASSIST_FIELDS.find((f) => f.key === key);
  if (!field) throw new Error(`Settings has no ${key} field`);
  return ruleRow(field, EXPERIENCED_CHOICES[key]);
});

/** The rule rows a card shows under the cards. */
export function detailRows(choice: LevelChoice): readonly OnboardingRow[] {
  return choice === 'experienced' ? EXPERIENCED_ROWS : choice === 'custom' ? CUSTOM_ROWS : [];
}

/** The saved value the row shows ('auto' for automatic quality). */
export function rowValue(row: OnboardingRow, settings: Settings): unknown {
  if (row.key === 'pedals') {
    // Settings can set the two pedals apart: that shows as Mixed until the row sets both.
    const a = settings.touchAnalogThrottle, b = settings.touchAnalogBrake;
    return a && b ? 'analog' : !a && !b ? 'onoff' : 'mixed';
  }
  return row.key === 'graphics' ? (settings.autoQuality ? 'auto' : settings.quality) : settings[row.key];
}

/** Index of the current option; -1 for a value the row does not offer (e.g. the TV camera). */
export function rowIndex(row: OnboardingRow, settings: Settings): number {
  const value = rowValue(row, settings);
  return row.options.findIndex((o) => o.value === value);
}

export function rowValueLabel(row: OnboardingRow, settings: Settings): string {
  const i = rowIndex(row, settings);
  if (i >= 0) return row.options[i].label;
  if (row.key === 'pedals') return 'Mixed';
  return row.key === 'camera' ? CAMERA_LABELS[settings.camera] : String(rowValue(row, settings));
}

export function rowHelp(row: OnboardingRow, settings: Settings): string {
  const i = rowIndex(row, settings);
  if (i >= 0) return row.options[i].help;
  return row.key === 'pedals' ? 'Analog on one pedal only (set in Settings). Change it here to set both.' : `Your current camera.${CAMERA_TIP}`;
}

export function rowWhere(row: OnboardingRow): string {
  return `Settings > ${row.settingsTab}`;
}

/**
 * One step through the row's options (wraps). Auto graphics restarts from High (automatic quality
 * only steps down); a tier turns automatic quality off.
 */
export function stepRow(settings: Settings, row: OnboardingRow, dir: -1 | 1): Settings {
  const n = row.options.length;
  const i = rowIndex(row, settings);
  const next = row.options[i < 0 ? (dir > 0 ? 0 : n - 1) : (i + dir + n) % n];
  if (row.key === 'graphics') {
    return next.value === 'auto' ? { ...settings, quality: 'high', autoQuality: true }
      : { ...settings, quality: next.value as Settings['quality'], autoQuality: false };
  }
  if (row.key === 'pedals') return { ...settings, touchAnalogThrottle: next.value === 'analog', touchAnalogBrake: next.value === 'analog' };
  return { ...settings, [row.key]: next.value };
}

export function withOnboarded(settings: Settings): Settings {
  return { ...settings, onboarded: true };
}
