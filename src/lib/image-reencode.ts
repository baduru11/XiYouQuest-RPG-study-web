import "server-only";

import sharp from "sharp";

/** Longest edge of a stored avatar. Larger uploads are scaled down to fit. */
export const AVATAR_MAX_DIMENSION = 512;

/**
 * Decode limit (width x height). A 2 MB PNG can declare a huge canvas that
 * would take gigabytes to decode, so refuse anything past 4096x4096 worth of
 * pixels before sharp allocates it.
 */
export const AVATAR_MAX_INPUT_PIXELS = 4096 * 4096;

/** Formats sharp is allowed to have decoded (matches the route's allowlist). */
const ALLOWED_INPUT_FORMATS = new Set(["png", "jpeg", "webp", "gif"]);

export class ImageReencodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageReencodeError";
  }
}

export interface ReencodedImage {
  bytes: Uint8Array;
  contentType: "image/webp";
  extension: "webp";
}

/**
 * Decodes an uploaded avatar and re-encodes it as a fresh WebP so only newly
 * generated pixels are ever stored. This drops anything that is not pixel
 * data: EXIF/XMP/ICC metadata, comments, and bytes appended after the image
 * (polyglot payloads). Animated GIF/WebP keep only the first frame. Throws
 * ImageReencodeError when the input cannot be decoded as an allowed format.
 */
export async function reencodeAvatar(input: Uint8Array): Promise<ReencodedImage> {
  const options = {
    // Reject outright corrupt input; tolerate mere warnings (common in phone
    // JPEGs) since the output is freshly encoded anyway.
    failOn: "error" as const,
    limitInputPixels: AVATAR_MAX_INPUT_PIXELS,
    animated: false,
  };

  try {
    const meta = await sharp(input, options).metadata();
    if (!meta.format || !ALLOWED_INPUT_FORMATS.has(meta.format)) {
      throw new ImageReencodeError(`Unsupported decoded format: ${meta.format ?? "unknown"}`);
    }

    const output = await sharp(input, options)
      // Bake EXIF orientation into the pixels before the metadata is dropped.
      .rotate()
      .resize(AVATAR_MAX_DIMENSION, AVATAR_MAX_DIMENSION, {
        fit: "inside",
        withoutEnlargement: true,
      })
      // sharp strips all metadata (EXIF, XMP, ICC, comments) unless asked to
      // keep it, and converts to sRGB, so no metadata call is made here.
      .webp({ quality: 85 })
      .toBuffer();

    return { bytes: new Uint8Array(output), contentType: "image/webp", extension: "webp" };
  } catch (error) {
    if (error instanceof ImageReencodeError) throw error;
    throw new ImageReencodeError(
      `Image could not be decoded: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
