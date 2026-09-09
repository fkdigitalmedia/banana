export interface ImageHeaderInfo {
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/avif';
  width: number;
  height: number;
}

/**
 * Lightweight, zero-dependency binary header parser to safely extract image dimensions
 * and detect real MIME type from ArrayBuffer without decoding entire image pixels.
 */
export function parseImageHeader(buffer: ArrayBuffer): ImageHeaderInfo | null {
  if (!buffer || buffer.byteLength < 24) return null;

  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  // 1. PNG check: 89 50 4E 47 0D 0A 1A 0A
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
    if (buffer.byteLength >= 24) {
      const width = view.getUint32(16, false);
      const height = view.getUint32(20, false);
      if (width > 0 && height > 0) {
        return { mimeType: 'image/png', width, height };
      }
    }
  }

  // 2. WebP check: "RIFF" .... "WEBP"
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    // VP8X (Extended WebP)
    if (bytes[12] === 0x56 && bytes[13] === 0x50 && bytes[14] === 0x38 && bytes[15] === 0x58 && buffer.byteLength >= 30) {
      const width = (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)) + 1;
      const height = (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)) + 1;
      return { mimeType: 'image/webp', width, height };
    }
    // VP8 (Lossy WebP)
    if (bytes[12] === 0x56 && bytes[13] === 0x50 && bytes[14] === 0x38 && bytes[15] === 0x20 && buffer.byteLength >= 30) {
      if (bytes[23] === 0x9D && bytes[24] === 0x01 && bytes[25] === 0x2A) {
        const width = view.getUint16(26, true) & 0x3fff;
        const height = view.getUint16(28, true) & 0x3fff;
        return { mimeType: 'image/webp', width, height };
      }
    }
    // VP8L (Lossless WebP)
    if (bytes[12] === 0x56 && bytes[13] === 0x50 && bytes[14] === 0x38 && bytes[15] === 0x4C && buffer.byteLength >= 25) {
      if (bytes[20] === 0x2F) {
        const b0 = bytes[21];
        const b1 = bytes[22];
        const b2 = bytes[23];
        const b3 = bytes[24];
        const width = (b0 | ((b1 & 0x3F) << 8)) + 1;
        const height = (((b1 & 0xC0) >> 6) | (b2 << 2) | ((b3 & 0x0F) << 10)) + 1;
        return { mimeType: 'image/webp', width, height };
      }
    }
    return { mimeType: 'image/webp', width: 800, height: 600 };
  }

  // 3. JPEG check: FF D8
  if (bytes[0] === 0xFF && bytes[1] === 0xD8) {
    let offset = 2;
    const len = buffer.byteLength;
    while (offset < len - 8) {
      if (bytes[offset] !== 0xFF) {
        offset++;
        continue;
      }
      const marker = bytes[offset + 1];
      // Standalone markers without length
      if (marker === 0xD8 || marker === 0xD9 || (marker >= 0xD0 && marker <= 0xD7)) {
        offset += 2;
        continue;
      }
      if (offset + 4 > len) break;
      const blockLength = view.getUint16(offset + 2, false);
      // SOF markers: SOF0(C0), SOF1(C1), SOF2(C2), SOF3(C3), SOF5(C5), SOF6(C6), SOF7(C7)
      if ((marker >= 0xC0 && marker <= 0xC3) || (marker >= 0xC5 && marker <= 0xC7) ||
          (marker >= 0xC9 && marker <= 0xCB) || (marker >= 0xCD && marker <= 0xCF)) {
        if (offset + 9 <= len) {
          const height = view.getUint16(offset + 5, false);
          const width = view.getUint16(offset + 7, false);
          if (width > 0 && height > 0) {
            return { mimeType: 'image/jpeg', width, height };
          }
        }
      }
      offset += 2 + blockLength;
    }
    return { mimeType: 'image/jpeg', width: 800, height: 600 };
  }

  // 4. AVIF check: ftypavif
  if (buffer.byteLength >= 12 &&
      bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70 &&
      bytes[8] === 0x61 && bytes[9] === 0x76 && bytes[10] === 0x69 && bytes[11] === 0x66) {
    return { mimeType: 'image/avif', width: 800, height: 600 };
  }

  return null;
}
