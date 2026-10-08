// Driving level cards of the first race setup: title, tagline and a few facts on a focusable
// button. Enter / A / a click selects a card; focus and hover do not. Styles: onboarding.css
import { h } from '@/hud/dom';
import { LEVEL_NAMES, type LevelChoice } from '@/race/driving-levels';
import { LEVEL_FACTS } from '@/ui/onboarding-model';
import { menuButton, setAdjust } from '@/ui/screen';

export interface LevelCard {
  choice: LevelChoice;
  el: HTMLButtonElement;
}

/** One card. `move` is called for left / right so the screen can step focus to the next card. */
export function levelCard(choice: LevelChoice, select: () => void, move: (dir: -1 | 1) => void): LevelCard {
  const name = LEVEL_NAMES[choice];
  const el = menuButton(name.title, select);
  el.classList.add('mn-onb__card');
  el.setAttribute('data-level-card', choice);
  el.setAttribute('aria-pressed', 'false');
  el.append(
    h('span', 'mn-onb__tagline', undefined, [name.tagline]),
    h('ul', 'mn-onb__facts', undefined, LEVEL_FACTS[choice].map((fact) => h('li', undefined, undefined, [fact]))),
  );
  setAdjust(el, move);
  return { choice, el };
}

export function markSelected(cards: readonly LevelCard[], choice: LevelChoice): void {
  for (const c of cards) {
    const on = c.choice === choice;
    c.el.setAttribute('aria-pressed', String(on));
    c.el.classList.toggle('is-selected', on);
  }
}
