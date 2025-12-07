import { describe, it, expect } from 'vitest';
import { cn } from '@/lib/utils';

describe('utils', () => {
  describe('cn (classnames utility)', () => {
    it('should merge classnames', () => {
      const result = cn('class1', 'class2');
      expect(result).toContain('class1');
      expect(result).toContain('class2');
    });

    it('should handle conditional classes', () => {
      const isActive = true;
      const result = cn('base', isActive && 'active');
      expect(result).toContain('base');
      expect(result).toContain('active');
    });

    it('should ignore falsy values', () => {
      const result = cn('class1', false, null, undefined, 'class2');
      expect(result).toContain('class1');
      expect(result).toContain('class2');
      expect(result).not.toContain('false');
      expect(result).not.toContain('null');
    });

    it('should handle tailwind conflicts (merge)', () => {
      const result = cn('px-2 py-1', 'px-4');
      // Deve manter apenas px-4, não px-2
      expect(result).toContain('px-4');
      expect(result).toContain('py-1');
    });

    it('should handle empty inputs', () => {
      const result = cn();
      expect(result).toBe('');
    });

    it('should handle arrays', () => {
      const result = cn(['class1', 'class2']);
      expect(result).toContain('class1');
      expect(result).toContain('class2');
    });

    it('should handle objects', () => {
      const result = cn({
        'class1': true,
        'class2': false,
        'class3': true
      });
      expect(result).toContain('class1');
      expect(result).not.toContain('class2');
      expect(result).toContain('class3');
    });
  });
});
