// Magic-byte sniffing for media uploads (spec Section 14/18): the declared
// Content-Type is never trusted on its own — the first bytes must prove the
// payload really is what it claims to be.
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PDF_PREFIX = '%PDF-';
const SVG_SCAN_BYTES = 1024;
const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);

function startsWith(bytes: Buffer, prefix: Buffer, offset = 0): boolean {
  if (bytes.length < offset + prefix.length) return false;
  return bytes.subarray(offset, offset + prefix.length).equals(prefix);
}

function startsWithAscii(bytes: Buffer, prefix: string, offset = 0): boolean {
  if (bytes.length < offset + prefix.length) return false;
  return bytes.toString('latin1', offset, offset + prefix.length) === prefix;
}

/** Whitespace+BOM skipping for the SVG text probe. */
function leadingTextOffset(bytes: Buffer): number {
  let offset = 0;
  if (startsWith(bytes, UTF8_BOM)) offset = UTF8_BOM.length;
  while (offset < bytes.length) {
    const byte = bytes[offset];
    // space, \n, \r, \t
    if (byte === 0x20 || byte === 0x0a || byte === 0x0d || byte === 0x09) {
      offset += 1;
    } else {
      break;
    }
  }
  return offset;
}

/**
 * Detects the supported asset types by magic bytes: png, jpeg, webp, pdf and
 * svg (svg is text — detected by a leading '<' after trim plus 'svg' inside
 * the first kilobyte). Returns null for anything else.
 */
export function sniffMime(bytes: Buffer): string | null {
  if (bytes.length === 0) return null;

  if (startsWith(bytes, PNG_SIGNATURE)) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (startsWithAscii(bytes, 'RIFF') && startsWithAscii(bytes, 'WEBP', 8)) return 'image/webp';
  if (startsWithAscii(bytes, PDF_PREFIX)) return 'application/pdf';

  const textOffset = leadingTextOffset(bytes);
  if (bytes[textOffset] === 0x3c /* '<' */) {
    const head = bytes
      .subarray(textOffset, Math.min(bytes.length, textOffset + SVG_SCAN_BYTES))
      .toString('utf8')
      .toLowerCase();
    // Strict: an SVG must open with an <svg root element (optionally after an
    // XML prolog/doctype). Matching the bare word "svg" would misclassify any
    // HTML document that merely mentions it.
    if (head.startsWith('<?xml') || head.startsWith('<!doctype')) {
      if (/<svg[\s>]/.test(head)) return 'image/svg+xml';
    } else if (head.startsWith('<svg')) {
      return 'image/svg+xml';
    }
  }
  return null;
}
