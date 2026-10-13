// Minimal ustar writer: bundles captured gesture frames into one download.
export interface TarFile {
  name: string;
  data: Uint8Array;
}

const BLOCK = 512;
const enc = new TextEncoder();

function writeString(buf: Uint8Array, offset: number, length: number, value: string): void {
  buf.set(enc.encode(value).subarray(0, length), offset);
}

function writeOctal(buf: Uint8Array, offset: number, length: number, value: number): void {
  writeString(buf, offset, length, value.toString(8).padStart(length - 1, '0') + '\0');
}

function header(name: string, size: number, mtime: number): Uint8Array {
  if (enc.encode(name).length > 100) throw new Error(`tar: name too long: ${name}`);
  const h = new Uint8Array(BLOCK);
  writeString(h, 0, 100, name);
  writeOctal(h, 100, 8, 0o644); // mode
  writeOctal(h, 108, 8, 0); // uid
  writeOctal(h, 116, 8, 0); // gid
  writeOctal(h, 124, 12, size);
  writeOctal(h, 136, 12, mtime);
  h.fill(0x20, 148, 156); // checksum field counts as spaces while summing
  h[156] = 0x30; // '0' = regular file
  writeString(h, 257, 6, 'ustar\0');
  writeString(h, 263, 2, '00');
  const sum = h.reduce((a, b) => a + b, 0);
  writeString(h, 148, 8, sum.toString(8).padStart(6, '0') + '\0 ');
  return h;
}

export function makeTar(
  files: readonly TarFile[],
  mtime = Math.floor(Date.now() / 1000),
): Uint8Array {
  const size = files.reduce((n, f) => n + BLOCK + Math.ceil(f.data.length / BLOCK) * BLOCK, 0);
  const out = new Uint8Array(size + 2 * BLOCK); // two zero blocks end the archive
  let o = 0;
  for (const f of files) {
    out.set(header(f.name, f.data.length, mtime), o);
    o += BLOCK;
    out.set(f.data, o);
    o += Math.ceil(f.data.length / BLOCK) * BLOCK;
  }
  return out;
}
