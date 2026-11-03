export const AVATAR_BUCKET = 'avatars';

const AVATAR_SIZE = 320;
const AVATAR_QUALITY = 0.85;
const MAX_SOURCE_SIZE = 15 * 1024 * 1024; // 15MB

/**
 * Calcula o maior quadrado central da imagem.
 */
export function getCenterSquare(width: number, height: number) {
  const size = Math.min(width, height);
  return {
    x: (width - size) / 2,
    y: (height - size) / 2,
    size,
  };
}

/**
 * Extrai o caminho no bucket a partir da URL pública do avatar.
 */
export function getAvatarStoragePath(avatarUrl?: string | null): string | null {
  const marker = `/object/public/${AVATAR_BUCKET}/`;
  const index = avatarUrl?.indexOf(marker) ?? -1;
  if (!avatarUrl || index === -1) {return null;}
  return decodeURIComponent(avatarUrl.slice(index + marker.length));
}

/**
 * Valida a foto escolhida e gera uma versão quadrada e leve.
 * Redesenhar no canvas também descarta metadados como a localização da foto.
 */
export async function prepareAvatarImage(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Selecione um arquivo de imagem.');
  }

  if (file.size > MAX_SOURCE_SIZE) {
    throw new Error('A imagem deve ter no máximo 15 MB.');
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('Formato de imagem não suportado. Use JPG, PNG ou WebP.');
  }

  try {
    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Não foi possível processar a imagem.');
    }

    const { x, y, size } = getCenterSquare(bitmap.width, bitmap.height);
    context.drawImage(bitmap, x, y, size, size, 0, 0, AVATAR_SIZE, AVATAR_SIZE);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/webp', AVATAR_QUALITY);
    });

    if (!blob) {
      throw new Error('Não foi possível processar a imagem.');
    }

    return blob;
  } finally {
    bitmap.close();
  }
}
