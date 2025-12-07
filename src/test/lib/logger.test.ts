import { describe, it, expect, beforeEach, vi } from 'vitest';
import { logger } from '@/lib/logger';

describe('Logger', () => {
  beforeEach(() => {
    // Restaura o estado do logger antes de cada teste
    logger.setEnabled(false);
  });

  it('should be disabled in production', () => {
    expect(logger.isEnabled()).toBe(false);
  });

  it('should not log when disabled', () => {
    const consoleSpy = vi.spyOn(console, 'log');
    logger.info('test message');
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('should log when enabled', () => {
    logger.setEnabled(true);
    const consoleSpy = vi.spyOn(console, 'log');
    logger.info('test message');
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('test message'));
    consoleSpy.mockRestore();
  });

  it('should support different log levels', () => {
    logger.setEnabled(true);
    
    const logSpy = vi.spyOn(console, 'log');
    const warnSpy = vi.spyOn(console, 'warn');
    const errorSpy = vi.spyOn(console, 'error');
    
    logger.info('info');
    logger.warn('warn');
    logger.error('error');
    
    expect(logSpy).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
    
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
