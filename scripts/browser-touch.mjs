// WebKit exposes native taps, but has no Chrome multi-touch protocol. The fallback
// exercises DOM pointer routing and Safari gesture cancellation, not iOS zoom.
export async function browserTouches(page, cdp) {
  const active = cdp ? null : await page.evaluateHandle(() => {
    const touches = new Map();
    const capture = HTMLElement.prototype.setPointerCapture;
    HTMLElement.prototype.setPointerCapture = function(id) {
      if (!touches.has(id)) return capture.call(this, id);
    };
    return touches;
  });
  return {
    method: cdp ? 'native Chrome CDP touch/pinch' : 'native WebKit taps; synthetic DOM multi-pointer/gesture routing',
    async touch(type, points = []) {
      if (cdp) {
        const event = { start: 'touchStart', move: 'touchMove', end: 'touchEnd', cancel: 'touchCancel' }[type];
        await cdp.send('Input.dispatchTouchEvent', { type: event, touchPoints: type === 'end' || type === 'cancel' ? [] : points.map(([x, y], id) => ({ x, y, id })) });
        return;
      }
      await page.evaluate(({ active, type, points }) => {
        const ending = type === 'end' || type === 'cancel';
        const list = ending ? [...active.entries()].map(([id, p]) => [id, p.x, p.y]) : points.map(([x, y], i) => [1000 + i, x, y]);
        for (const [id, x, y] of list) {
          if (type === 'start') active.set(id, { target: document.elementFromPoint(x, y), x, y });
          const p = active.get(id);
          if (!p?.target) throw new Error('Synthetic pointer missed its target');
          p.x = x; p.y = y;
          p.target.dispatchEvent(new PointerEvent(ending ? type === 'cancel' ? 'pointercancel' : 'pointerup' : type === 'start' ? 'pointerdown' : 'pointermove', {
            pointerId: id, pointerType: 'touch', isPrimary: id === 1000,
            clientX: x, clientY: y, bubbles: true, cancelable: true, buttons: ending ? 0 : 1, pressure: ending ? 0 : 0.5,
          }));
          if (ending) active.delete(id);
        }
      }, { active, type, points });
    },
    async pinch([x, y, scale]) {
      if (cdp) return cdp.send('Input.synthesizePinchGesture', { x, y, scaleFactor: scale, gestureSourceType: 'touch' });
      await page.evaluate(scale => {
        for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
          const event = new Event(type, { bubbles: true, cancelable: true });
          Object.defineProperty(event, 'scale', { value: scale });
          document.dispatchEvent(event);
          if (!event.defaultPrevented) throw new Error(`Safari ${type} was not cancelled`);
        }
      }, scale);
    },
  };
}
