export type PhotoType = { ext: 'jpg' | 'png' | 'webp'; contentType: string };

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWith(data: Buffer, bytes: number[], offset = 0): boolean {
  return bytes.every((byte, i) => data[offset + i] === byte);
}

/** Detects JPEG, PNG or WebP from the leading bytes only. */
export function detectPhotoType(data: Buffer): PhotoType | null {
  if (startsWith(data, [0xff, 0xd8, 0xff])) {
    return { ext: 'jpg', contentType: 'image/jpeg' };
  }
  if (startsWith(data, PNG)) {
    return { ext: 'png', contentType: 'image/png' };
  }
  if (
    startsWith(data, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(data, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return { ext: 'webp', contentType: 'image/webp' };
  }
  return null;
}

const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export function contentTypeForKey(key: string): string {
  const ext = key.slice(key.lastIndexOf('.') + 1);
  return CONTENT_TYPES[ext] ?? 'application/octet-stream';
}
