// The photo sent to the server: at most 2048 px on its long side, JPEG 90 %
// like the app (D48), oriented, and without its metadata (no GPS position
// leaves the phone). The photos bucket takes JPEG, PNG, WebP and HEIC up to
// 10 MB (D131): a JPEG over the limit is made again at a lower quality, then
// smaller. Falls back to the original file when the browser cannot decode
// it (HEIC outside Safari); the upload checks its type and size first.

export const MAX_SIDE = 2048;
/** file_size_limit of the photos bucket. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
/** allowed_mime_types of the photos bucket. */
export const UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const;

/** Qualities then scales tried in turn until the JPEG fits (the first one nearly always does). */
const ATTEMPTS: ReadonlyArray<{ quality: number; scale: number }> = [
  { quality: 0.9, scale: 1 },
  { quality: 0.8, scale: 1 },
  { quality: 0.7, scale: 1 },
  { quality: 0.7, scale: 0.75 },
  { quality: 0.6, scale: 0.5 },
];

export function fitWithin(width: number, height: number, max = MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** The type the bucket is told, or null when it refuses the file (image/heif is HEIC's container). */
export function uploadType(type: string): (typeof UPLOAD_TYPES)[number] | null {
  const normalized = type.toLowerCase() === 'image/heif' ? 'image/heic' : type.toLowerCase();
  return (UPLOAD_TYPES as readonly string[]).includes(normalized) ? (normalized as (typeof UPLOAD_TYPES)[number]) : null;
}

/**
 * The first encoding under [limit] bytes, trying lower qualities then
 * smaller sizes; null when none fits or the encoder fails.
 */
export async function encodeUnderLimit(
  encode: (quality: number, scale: number) => Promise<Blob | null>,
  limit = MAX_UPLOAD_BYTES,
): Promise<Blob | null> {
  for (const { quality, scale } of ATTEMPTS) {
    const blob = await encode(quality, scale);
    if (!blob) return null;
    if (blob.size <= limit) return blob;
  }
  return null;
}

/** HEIC/HEIF brands of the ISO BMFF "ftyp" box (bytes 8 to 12). */
const HEIC_BRANDS = ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'];

/** True when the name or type says HEIC/HEIF (cheap, before reading the file). */
export function namedHeic(type: string, name: string): boolean {
  return /^image\/hei[cf]/i.test(type) || /\.(heic|heif)$/i.test(name);
}

/** True for a HEIC/HEIF file, by its type, its name or its first bytes (Android often sends no type). */
export async function looksHeic(file: Blob, name = ''): Promise<boolean> {
  if (namedHeic(file.type, name)) return true;
  try {
    const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const text = String.fromCharCode(...head);
    return text.slice(4, 8) === 'ftyp' && HEIC_BRANDS.includes(text.slice(8, 12).toLowerCase());
  } catch {
    return false;
  }
}

/**
 * A HEIC photo as JPEG, decoded in the page (libheif, loaded only for such
 * a file): Chrome and Firefox cannot show or redraw HEIC, and the moderation
 * and video providers do not take it. Throws when the file cannot be decoded.
 */
export async function heicToJpeg(file: Blob): Promise<Blob> {
  const { heicTo } = await import('heic-to');
  return heicTo({ blob: file, type: 'image/jpeg', quality: 0.92 });
}

export async function prepareUpload(file: Blob): Promise<Blob> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const size = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return file;
    const encoded = await encodeUnderLimit(async (quality, scale) => {
      canvas.width = Math.max(1, Math.round(size.width * scale));
      canvas.height = Math.max(1, Math.round(size.height * scale));
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    });
    bitmap.close();
    return encoded ?? file;
  } catch {
    return file;
  }
}
