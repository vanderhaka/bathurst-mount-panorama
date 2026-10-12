// Race setup: opponents, laps and AI skill, then car select. Rows reuse the first-race setup's choice rows.
import '@/ui/onboarding.css';
import '@/ui/race.css';
import { h } from '@/hud/dom';
import { AI_SKILLS, RACE_LAPS, RACE_OPPONENTS, type AiSkill, type RaceOptions } from '@/types/race';
import { loadRaceOptions, saveRaceOptions, stepChoice } from '@/ui/race-options-store';
import { hintBar, kicker, menuButton, type Screen, screenEl, valueRow } from '@/ui/screen';

export interface RaceSetupActions {
  /** Options chosen: on to car select. */
  next(options: RaceOptions): void;
  back(): void;
}

const SKILL: Record<AiSkill, { label: string; help: string }> = {
  easy: { label: 'Easy', help: 'Room to learn the track' },
  medium: { label: 'Medium', help: 'A fair fight' },
  hard: { label: 'Hard', help: 'Near the limit' },
};

interface ChoiceRow {
  el: HTMLElement;
  show(text: string, index: number, count: number, help: string): void;
}

function choiceRow(label: string, key: string, onStep: (dir: -1 | 1) => void): { row: ChoiceRow; block: HTMLElement } {
  const r = valueRow(label, onStep, 'mn-value--setting mn-value--choice');
  r.el.setAttribute('data-race-option', key);
  const help = h('p', 'mn-help mn-onb__help');
  const block = h('div', 'mn-onb__row', undefined, [r.el, h('div', 'mn-onb__note', undefined, [help])]);
  const show = (text: string, index: number, count: number, note: string): void => {
    r.value.replaceChildren(h('span', 'mn-value__text', undefined, [text]), h('span', 'mn-pips', { 'aria-hidden': 'true' }, Array.from({ length: count }, (_, i) => h('i', i === index ? 'is-on' : ''))));
    r.el.dataset.value = text;
    r.el.setAttribute('aria-label', `${label}: ${text}. Left and right to change.`);
    help.textContent = note;
  };
  return { row: { el: r.el, show }, block };
}

export class RaceSetupScreen implements Screen {
  readonly id = 'raceSetup' as const;
  readonly el = screenEl('raceSetup', 'Race setup', 'mn-screen--dim');
  private options: RaceOptions = loadRaceOptions();
  private readonly opponents = choiceRow('Opponents', 'opponents', (d) => this.change({ opponents: stepChoice(RACE_OPPONENTS, this.options.opponents, d) }));
  private readonly laps = choiceRow('Laps', 'laps', (d) => this.change({ laps: stepChoice(RACE_LAPS, this.options.laps, d) }));
  private readonly skill = choiceRow('AI', 'skill', (d) => this.change({ skill: stepChoice(AI_SKILLS, this.options.skill, d) }));
  private readonly choose = menuButton('Choose car', () => this.actions.next({ ...this.options }), { variant: 'primary' });
  private readonly backBtn = menuButton('Back', () => this.actions.back());

  constructor(private readonly actions: RaceSetupActions) {
    this.el.append(
      h('div', 'mn-panel mn-panel--race-setup', undefined, [
        h('header', 'mn-panel__head', undefined, [kicker('Player vs AI'), h('h2', 'mn-h2', undefined, ['Race']), h('p', 'mn-help', undefined, ['You start at the back. Cars can touch.'])]),
        h('div', 'mn-onb__rows', undefined, [this.opponents.block, this.laps.block, this.skill.block]),
        h('footer', 'mn-panel__foot', undefined, [h('span'), h('div', 'mn-onb__buttons', undefined, [this.choose, this.backBtn])]),
      ]),
      hintBar([['↑↓', 'DPAD', 'Select'], ['←→', 'DPAD', 'Change'], ['Enter', 'A', 'Confirm'], ['Esc', 'B', 'Back']]),
    );
    this.render();
  }

  private change(patch: Partial<RaceOptions>): void {
    this.options = { ...this.options, ...patch };
    saveRaceOptions(this.options);
    this.render();
  }

  private render(): void {
    const o = this.options;
    this.opponents.row.show(String(o.opponents), RACE_OPPONENTS.indexOf(o.opponents), RACE_OPPONENTS.length, `${o.opponents + 1} cars on the grid`);
    this.laps.row.show(String(o.laps), RACE_LAPS.indexOf(o.laps), RACE_LAPS.length, 'Race distance');
    this.skill.row.show(SKILL[o.skill].label, AI_SKILLS.indexOf(o.skill), AI_SKILLS.length, SKILL[o.skill].help);
  }

  items(): HTMLElement[] { return [this.opponents.row.el, this.laps.row.el, this.skill.row.el, this.choose, this.backBtn]; }

  back(): void { this.actions.back(); }
}
