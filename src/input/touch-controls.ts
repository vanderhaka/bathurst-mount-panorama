// Phone controls. Sensor permission is requested only by the visible Enable tilt tap.
import '@/input/touch.css';
import { h } from '@/hud/dom';
import type { GameAction } from '@/input/bindings';
import { TiltSteering, type TiltStatus } from '@/input/tilt-steering';
import { TouchInputModel, analogPedal, pedalAt, type TouchOptions } from '@/input/touch-model';
export { dragSteer } from '@/input/touch-model';

const STEER_RANGE = 0.17;

export class TouchControls {
  readonly el: HTMLElement;
  touched = false;
  onAction: (action: GameAction) => void = () => {};
  sensitivity = 1;
  private readonly model = new TouchInputModel();
  private readonly tilt = new TiltSteering();
  private readonly steerZone = h('div', 'tc-steer');
  private readonly wheel = h('div', 'tc-wheel', { 'aria-hidden': 'true' }, [h('i', 'tc-wheel__knob')]);
  private readonly hint = h('span', 'tc-steer__hint', undefined, ['Drag to steer']);
  private readonly brakeEl = h('div', 'tc-pedal tc-pedal--brake', undefined, ['Brake']);
  private readonly throttleEl = h('div', 'tc-pedal tc-pedal--throttle', undefined, ['Throttle']);
  private readonly tiltButton = h('button', 'tc-tilt-enable', { type: 'button' }, ['Enable tilt']);
  private readonly tiltNote = h('span', 'tc-sensor__note');
  private visible = false;
  private suspended = false;

  constructor(container: HTMLElement) {
    const arrow = (side: 'left' | 'right', text: string) => h('button', `tc-arrow tc-arrow--${side}`,
      { type: 'button', 'data-steer': side, 'aria-label': `Steer ${side}` }, [text]);
    this.steerZone.append(this.wheel, this.hint,
      h('div', 'tc-arrows', undefined, [arrow('left', '←'), arrow('right', '→')]),
      h('div', 'tc-sensor', undefined, [this.tiltButton, this.tiltNote]));
    this.tiltButton.addEventListener('click', () => {
      // Recentres only the tilt: the tap itself registers no finger (onDown skips .tc-sensor),
      // so a pedal the other thumb holds stays held.
      // requestPermission is invoked synchronously here, before any promise continuation.
      void this.enableTilt();
    });
    const button = (action: GameAction, label: string, text: string) => {
      const b = h('button', `tc-btn tc-btn--${action}`, { type: 'button', 'aria-label': label }, [text]);
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.onAction(action);
      });
      return b;
    };
    this.el = h('div', 'bx-touch', { 'data-visible': 'false' }, [this.steerZone,
      h('div', 'tc-buttons', undefined, [button('shiftDown', 'Shift down', 'Gear −'), button('shiftUp', 'Shift up', 'Gear +'), button('pause', 'Pause', 'II'), button('camera', 'Change camera', 'View')]),
      h('div', 'tc-pedals', undefined, [this.brakeEl, this.throttleEl]),
    ]);
    this.el.addEventListener('pointerdown', this.onDown);
    this.el.addEventListener('pointermove', this.onMove);
    this.el.addEventListener('pointerup', this.onUp);
    this.el.addEventListener('pointercancel', this.onUp);
    this.el.addEventListener('lostpointercapture', this.onUp);
    window.addEventListener('pointerdown', this.onTouch, true);
    window.addEventListener('blur', this.onSuspend);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.configure(this.model.options);
    container.append(this.el);
  }

  /** The one way to ask for motion access: the Enable tilt button and the steering question both
   * call it synchronously inside a tap. Works while the controls are hidden: listening starts when
   * they show, centred on the pose held then. */
  enableTilt(): Promise<TiltStatus> { return this.tilt.enableFromTap(); }

  configure(options: Readonly<TouchOptions>, manualGears = false): void {
    this.model.configure(options);
    this.el.dataset.mode = options.mode;
    this.el.dataset.leftHanded = String(options.leftHanded);
    this.el.dataset.autoThrottle = String(options.autoThrottle);
    this.el.dataset.manualGears = String(manualGears);
    this.tilt.setActive(this.visible && !this.suspended && options.mode === 'tilt');
  }
  private range(): number {
    return STEER_RANGE * Math.min(this.el.clientWidth, this.el.clientHeight) / Math.max(0.5, this.sensitivity);
  }
  private samplePedal(id: number, x: number, y: number): void {
    const t = this.throttleEl.getBoundingClientRect();
    const b = this.brakeEl.getBoundingClientRect();
    const pedal = this.model.options.autoThrottle ? 'brake' : pedalAt(x, b, t);
    // Both pedals report the thumb height; the model uses it only when that pedal is analog.
    this.model.pedal(id, pedal, pedal === 'throttle' ? analogPedal(y, t.top, t.height) : analogPedal(y, b.top, b.height));
  }
  private readonly onTouch = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') { this.touched = true; this.suspended = false; }
  };
  private readonly onSuspend = (): void => { this.suspended = true; this.model.reset(); this.tilt.setActive(false); };
  private readonly onVisibility = (): void => { if (document.hidden) this.onSuspend(); };

  private readonly onDown = (e: PointerEvent): void => {
    this.onTouch(e);
    const target = e.target as HTMLElement;
    if (target.closest('.tc-sensor')) return; // preserve the click's user activation
    const side = target.closest<HTMLElement>('[data-steer]')?.dataset.steer;
    if (this.model.options.mode === 'buttons' && (side === 'left' || side === 'right')) this.model.button(e.pointerId, side);
    else if (this.steerZone.contains(target) && this.model.options.mode !== 'buttons' && !this.tilt.ready) {
      this.model.dragStart(e.pointerId, e.clientX, e.clientY);
    } else if (target.closest('.tc-pedals')) this.samplePedal(e.pointerId, e.clientX, e.clientY);
    else return;
    e.preventDefault();
    this.el.setPointerCapture?.(e.pointerId);
  };
  private readonly onMove = (e: PointerEvent): void => {
    const kind = this.model.kind(e.pointerId);
    if (kind === 'pedal') this.samplePedal(e.pointerId, e.clientX, e.clientY);
    else if (kind === 'drag') this.model.dragMove(e.pointerId, e.clientX, this.range());
  };
  private readonly onUp = (e: PointerEvent): void => { this.model.release(e.pointerId); };

  update(dt: number, show: boolean): { steer: number; throttle: number; brake: number } {
    if (show !== this.visible) { this.visible = show; this.el.dataset.visible = String(show); }
    const active = show && !this.suspended;
    this.tilt.setActive(active && this.model.options.mode === 'tilt');
    const steer = this.tilt.update(dt, this.sensitivity);
    const controls = this.model.update(dt, active, { steer, ready: this.tilt.ready });
    if (show) this.draw(controls);
    return controls;
  }
  private draw(controls: { steer: number; throttle: number; brake: number }): void {
    const thumb = this.model.thumb, zone = this.steerZone.getBoundingClientRect();
    this.wheel.style.width = `${this.range() * 2}px`;
    this.wheel.dataset.active = String(!!thumb);
    this.wheel.style.left = thumb ? `${thumb.origin - zone.left}px` : '';
    this.wheel.style.top = thumb ? `${thumb.y - zone.top}px` : '';
    this.wheel.style.setProperty('--tc-steer', String(-controls.steer));
    this.throttleEl.style.setProperty('--tc-throttle', `${controls.throttle * 100}%`);
    this.throttleEl.classList.toggle('is-on', controls.throttle > 0);
    this.brakeEl.style.setProperty('--tc-brake', `${controls.brake * 100}%`);
    this.brakeEl.classList.toggle('is-on', controls.brake > 0);
    this.el.dataset.tiltReady = String(this.tilt.ready);
    this.tiltButton.disabled = this.tilt.status === 'requesting';
    const label = this.tilt.status === 'granted' ? 'Centre tilt' : 'Enable tilt';
    if (this.tiltButton.textContent !== label) this.tiltButton.textContent = label;
    const note = this.tilt.status === 'denied' ? 'Permission off · drag works'
      : this.tilt.status === 'unavailable' ? 'Tilt unavailable · drag works'
      : this.tilt.status === 'requesting' ? 'Waiting for permission'
      : this.tilt.ready ? 'Tilt to steer' : 'Hold phone centred';
    if (this.tiltNote.textContent !== note) this.tiltNote.textContent = note;
  }
  dispose(): void {
    this.model.reset();
    this.tilt.dispose();
    window.removeEventListener('pointerdown', this.onTouch, true);
    window.removeEventListener('blur', this.onSuspend);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.el.remove();
  }
}
