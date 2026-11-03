import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { pwaUpdateManager } from '@/lib/pwaUpdateManager';

describe('pwaUpdateManager', () => {
  const update = vi.fn();

  const setVisibility = (state: DocumentVisibilityState) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
    document.dispatchEvent(new Event('visibilitychange'));
  };

  beforeEach(async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: '1.0.0', buildTime: '2026-11-01T00:00:00.000Z' }),
    }));
    update.mockReset().mockResolvedValue({ waiting: null });

    await pwaUpdateManager.init({
      update,
      addEventListener: vi.fn(),
    } as unknown as ServiceWorkerRegistration);
    update.mockClear();
  });

  afterEach(() => {
    pwaUpdateManager.destroy();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('should check for updates when the app returns to the foreground', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2030-01-01T10:00:00Z'));

    setVisibility('visible');

    await vi.waitFor(() => expect(update).toHaveBeenCalledTimes(1));
  });

  it('should not check while the app goes to the background', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2030-01-02T10:00:00Z'));

    setVisibility('hidden');
    await Promise.resolve();

    expect(fetch).toHaveBeenCalledTimes(2); // Apenas as chamadas do init
    expect(update).not.toHaveBeenCalled();
  });

  it('should throttle repeated resume checks', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2030-01-03T10:00:00Z'));

    setVisibility('visible');
    await vi.waitFor(() => expect(update).toHaveBeenCalledTimes(1));

    setVisibility('visible');
    await Promise.resolve();
    expect(fetch).toHaveBeenCalledTimes(3); // init (2) + primeira retomada

    vi.setSystemTime(new Date('2030-01-03T10:01:00Z'));
    setVisibility('visible');
    await vi.waitFor(() => expect(update).toHaveBeenCalledTimes(2));
  });
});
