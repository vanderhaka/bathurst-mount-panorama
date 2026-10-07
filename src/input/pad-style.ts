// Controller families and their button names. The game's bindings and prompts use
// the standard-layout (Xbox) names as keys; a PlayStation controller shows its own.

/** Controller family: decides the names and symbols shown in prompts. */
export type PadStyle = 'xbox' | 'ps4' | 'ps5';

/**
 * Sony controllers in the Gamepad API id formats of Chrome / Edge ("… Vendor: 054c …"),
 * Firefox ("54c-ce6-…") and Safari ("DualSense Wireless Controller").
 */
const SONY = /054c|^54c-|dualsense|dualshock|playstation/i;
const PS5 = /dualsense|0?ce6|0?df2/i;

/** Controller family from a Gamepad API id. Anything not recognised as Sony gets the standard (Xbox) names. */
export function padStyleOf(id: string): PadStyle {
  if (/xbox|045e/i.test(id) || !SONY.test(id)) return 'xbox';
  return PS5.test(id) ? 'ps5' : 'ps4';
}

const PLAYSTATION: Record<string, string> = {
  A: '✕', B: '○', X: '□', Y: '△',
  LB: 'L1', RB: 'R1', LT: 'L2', RT: 'R2',
  Menu: 'Options',
};

/** Name of a control for a controller family. `label` is the standard name (A, B, LT, View, …). */
export function padName(label: string, style: PadStyle): string {
  if (style === 'xbox') return label;
  if (label === 'View') return style === 'ps5' ? 'Create' : 'Share';
  return PLAYSTATION[label] ?? label;
}

/** Fills "{A}"-style placeholders in a help text with the control names of a controller family. */
export function fillPadText(template: string, style: PadStyle): string {
  return template.replace(/\{(\w+)\}/g, (_, label: string) => padName(label, style));
}
