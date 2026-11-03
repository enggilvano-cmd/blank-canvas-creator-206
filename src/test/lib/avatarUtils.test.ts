import { describe, it, expect, vi, afterEach } from 'vitest';
import { getAvatarStoragePath, getCenterSquare, prepareAvatarImage } from '@/lib/avatarUtils';

describe('avatarUtils', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('getCenterSquare', () => {
    it('should crop the sides of landscape images', () => {
      expect(getCenterSquare(800, 600)).toEqual({ x: 100, y: 0, size: 600 });
    });

    it('should crop the top and bottom of portrait images', () => {
      expect(getCenterSquare(600, 800)).toEqual({ x: 0, y: 100, size: 600 });
    });
  });

  describe('getAvatarStoragePath', () => {
    it('should extract the bucket path from a public URL', () => {
      const url = 'https://abc.supabase.co/storage/v1/object/public/avatars/user-1/123.webp';

      expect(getAvatarStoragePath(url)).toBe('user-1/123.webp');
    });

    it('should return null without an avatar stored in the bucket', () => {
      expect(getAvatarStoragePath(undefined)).toBeNull();
      expect(getAvatarStoragePath('https://example.com/photo.png')).toBeNull();
    });
  });

  describe('prepareAvatarImage', () => {
    it('should reject files that are not images', async () => {
      const file = new File(['pdf'], 'doc.pdf', { type: 'application/pdf' });

      await expect(prepareAvatarImage(file)).rejects.toThrow('Selecione um arquivo de imagem.');
    });

    it('should reject oversized files', async () => {
      const file = new File(['x'], 'foto.jpg', { type: 'image/jpeg' });
      Object.defineProperty(file, 'size', { value: 16 * 1024 * 1024 });

      await expect(prepareAvatarImage(file)).rejects.toThrow('A imagem deve ter no máximo 15 MB.');
    });

    it('should explain when the browser cannot decode the image', async () => {
      vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('decode')));
      const file = new File(['x'], 'foto.heic', { type: 'image/heic' });

      await expect(prepareAvatarImage(file)).rejects.toThrow('Formato de imagem não suportado');
    });

    it('should draw the centered square on a 320px canvas', async () => {
      const close = vi.fn();
      const drawImage = vi.fn();
      const bitmap = { width: 800, height: 600, close };
      const output = new Blob(['img'], { type: 'image/webp' });

      vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
        { drawImage } as unknown as CanvasRenderingContext2D
      );
      vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(output));

      const file = new File(['x'], 'foto.jpg', { type: 'image/jpeg' });

      await expect(prepareAvatarImage(file)).resolves.toBe(output);
      expect(drawImage).toHaveBeenCalledWith(bitmap, 100, 0, 600, 600, 0, 0, 320, 320);
      expect(close).toHaveBeenCalled();
    });
  });
});
