// @vitest-environment node
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  AVATAR_MAX_DIMENSION,
  ImageReencodeError,
  reencodeAvatar,
} from "@/lib/image-reencode";

async function solidImage(
  format: "png" | "jpeg",
  width = 64,
  height = 48,
  withExif = false,
): Promise<Uint8Array> {
  let pipeline = sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 30, b: 60 } },
  });
  if (withExif) {
    pipeline = pipeline.withExif({
      IFD0: { Make: "LeakyCam", Model: "GPS-9000", Copyright: "secret-owner" },
    });
  }
  const buf = format === "png" ? await pipeline.png().toBuffer() : await pipeline.jpeg().toBuffer();
  return new Uint8Array(buf);
}

function bytesInclude(haystack: Uint8Array, needle: string): boolean {
  return Buffer.from(haystack).includes(Buffer.from(needle, "latin1"));
}

describe("reencodeAvatar", () => {
  it("re-encodes a PNG to fresh WebP bytes that decode and fit the limits", async () => {
    const input = await solidImage("png");
    const out = await reencodeAvatar(input);

    expect(out.contentType).toBe("image/webp");
    expect(out.extension).toBe("webp");
    expect(Buffer.from(out.bytes).equals(Buffer.from(input))).toBe(false);

    const meta = await sharp(out.bytes).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(64);
    expect(meta.height).toBe(48);
    expect(out.bytes.byteLength).toBeLessThan(2 * 1024 * 1024);
  });

  it("re-encodes a JPEG and shrinks large images to the maximum, keeping aspect", async () => {
    const input = await solidImage("jpeg", 2000, 1000);
    const out = await reencodeAvatar(input);

    const meta = await sharp(out.bytes).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(AVATAR_MAX_DIMENSION);
    expect(meta.height).toBe(AVATAR_MAX_DIMENSION / 2);
  });

  it("strips EXIF and ICC metadata", async () => {
    const input = await solidImage("jpeg", 64, 64, true);
    expect(bytesInclude(input, "LeakyCam")).toBe(true);
    expect((await sharp(input).metadata()).exif).toBeDefined();

    const out = await reencodeAvatar(input);
    const meta = await sharp(out.bytes).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.icc).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(bytesInclude(out.bytes, "LeakyCam")).toBe(false);
    expect(bytesInclude(out.bytes, "secret-owner")).toBe(false);
  });

  it("drops a payload appended after the image end marker", async () => {
    const payload = "<script>alert(1)</script>PK\u0003\u0004polyglot-payload";
    for (const format of ["png", "jpeg"] as const) {
      const image = await solidImage(format);
      const input = new Uint8Array([...image, ...Buffer.from(payload, "latin1")]);
      expect(bytesInclude(input, "polyglot-payload")).toBe(true);

      const out = await reencodeAvatar(input);
      expect(bytesInclude(out.bytes, "polyglot-payload")).toBe(false);
      expect(bytesInclude(out.bytes, "<script>")).toBe(false);
      expect((await sharp(out.bytes).metadata()).format).toBe("webp");
    }
  });

  it("rejects a file with an image magic header but an undecodable body", async () => {
    const garbage = (header: number[]) =>
      new Uint8Array([...header, ...Buffer.from("<?php system($_GET['c']); ?> not an image at all", "latin1")]);

    await expect(reencodeAvatar(garbage([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).rejects.toBeInstanceOf(
      ImageReencodeError,
    );
    await expect(reencodeAvatar(garbage([0xff, 0xd8, 0xff, 0xe0]))).rejects.toBeInstanceOf(ImageReencodeError);
    await expect(reencodeAvatar(garbage([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).rejects.toBeInstanceOf(
      ImageReencodeError,
    );
  });

  it("rejects a truncated image", async () => {
    const image = await solidImage("png", 128, 128);
    await expect(reencodeAvatar(image.slice(0, Math.floor(image.length / 2)))).rejects.toBeInstanceOf(
      ImageReencodeError,
    );
  });

  it("rejects decodable formats outside the avatar allowlist (e.g. SVG)", async () => {
    const svg = new Uint8Array(
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>'),
    );
    await expect(reencodeAvatar(svg)).rejects.toBeInstanceOf(ImageReencodeError);
  });

  it("rejects images whose pixel count exceeds the decompression-bomb limit", async () => {
    const huge = new Uint8Array(
      await sharp({ create: { width: 5000, height: 5000, channels: 3, background: "#fff" } })
        .png({ compressionLevel: 9 })
        .toBuffer(),
    );
    await expect(reencodeAvatar(huge)).rejects.toBeInstanceOf(ImageReencodeError);
  });
});
