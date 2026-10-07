import { describe, expect, it, vi } from 'vitest';
import { RaceWakeLock } from '@/phone/wake-lock';

const sentinel = () => ({ release: vi.fn().mockResolvedValue(undefined), addEventListener: vi.fn() });
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };

describe('race screen wake lock', () => {
  it('requests during a visible race and releases on pause, then reacquires on resume', async () => {
    const a = sentinel(), b = sentinel();
    const request = vi.fn().mockResolvedValueOnce(a).mockResolvedValueOnce(b);
    const lock = new RaceWakeLock({ request }, () => true);
    lock.setRunning(true); lock.setRunning(true); await settle();
    expect(request).toHaveBeenCalledExactlyOnceWith('screen');
    lock.setRunning(false); await settle(); expect(a.release).toHaveBeenCalledOnce();
    lock.setRunning(true); await settle(); expect(request).toHaveBeenCalledTimes(2);
    lock.dispose(); expect(b.release).toHaveBeenCalledOnce();
  });
  it('releases a late grant after the player paused while permission was pending', async () => {
    const a = sentinel(); let resolve!: (value: typeof a) => void;
    const request = vi.fn(() => new Promise<typeof a>(done => { resolve = done; }));
    const lock = new RaceWakeLock({ request }, () => true);
    lock.setRunning(true); lock.setRunning(false); resolve(a); await settle();
    expect(a.release).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledOnce();
  });
  it('reacquires on visibility restoration and tolerates unavailable or denied APIs', async () => {
    let visible = false;
    const a = sentinel(), request = vi.fn().mockRejectedValueOnce(new Error('Power save')).mockResolvedValueOnce(a);
    const lock = new RaceWakeLock({ request }, () => visible);
    lock.setRunning(true); await settle(); expect(request).not.toHaveBeenCalled();
    visible = true; lock.visibilityChanged(); await settle(); expect(request).toHaveBeenCalledOnce();
    lock.visibilityChanged(); await settle(); expect(request).toHaveBeenCalledTimes(2);
    visible = false; lock.visibilityChanged(); expect(a.release).toHaveBeenCalledOnce();
    new RaceWakeLock(undefined, () => true).setRunning(true);
  });
});
