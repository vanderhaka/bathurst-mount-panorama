import { describe, expect, it, vi } from 'vitest';
import { ResultsScreen } from '@/ui/screens/results';

/** Navigation methods need only buttons; the Node tests do not need a DOM renderer. */
function fixture() {
  const button = (hidden = false) => ({ hidden, click: vi.fn() }) as unknown as HTMLButtonElement;
  const menu = button(), backToSession = button(true);
  const buttons = [button(), button(), menu, button(), backToSession];
  const screen = Object.assign(Object.create(ResultsScreen.prototype), { buttons, backToSession }) as ResultsScreen;
  return { screen, menu, backToSession };
}

describe('results opened from a paused session', () => {
  it('returns to the paused race on Back and keeps Main menu available', () => {
    const { screen, menu, backToSession } = fixture();
    screen.setSessionReturn(true);
    expect(screen.items()).toContain(backToSession);
    expect(screen.items()).toContain(menu);
    screen.back();
    expect(backToSession.click).toHaveBeenCalledOnce();
    expect(menu.click).not.toHaveBeenCalled();
    menu.click();
    expect(menu.click).toHaveBeenCalledOnce();
  });

  it('resets the return when standalone results open later, preserving the original Back behavior', () => {
    const { screen, menu, backToSession } = fixture();
    screen.setSessionReturn(true);
    screen.setSessionReturn(false);
    expect(screen.items()).not.toContain(backToSession);
    expect(screen.items()).toContain(menu);
    screen.back();
    expect(menu.click).toHaveBeenCalledOnce();
    expect(backToSession.click).not.toHaveBeenCalled();
  });
});
