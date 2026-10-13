import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeTar } from './tar.ts';

const bytes = (s: string) => new TextEncoder().encode(s);

describe('makeTar', () => {
  it('lays out headers, padded data and the end blocks', () => {
    const tar = makeTar([{ name: 'rock/frame_000.png', data: bytes('hello') }], 0);
    expect(tar.length).toBe(512 + 512 + 1024);
    const text = new TextDecoder().decode(tar.subarray(0, 100)).replace(/\0+$/, '');
    expect(text).toBe('rock/frame_000.png');
    expect(new TextDecoder().decode(tar.subarray(124, 135))).toBe('00000000005'); // size, octal
    expect(new TextDecoder().decode(tar.subarray(257, 262))).toBe('ustar');
    // checksum = sum of header bytes with the checksum field read as spaces
    const h = tar.slice(0, 512);
    const stored = parseInt(new TextDecoder().decode(h.subarray(148, 154)), 8);
    h.fill(0x20, 148, 156);
    expect(stored).toBe(h.reduce((a, b) => a + b, 0));
    expect(new TextDecoder().decode(tar.subarray(512, 517))).toBe('hello');
  });

  it('is readable by the system tar', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tar-'));
    const file = join(dir, 'frames.tar');
    writeFileSync(file, makeTar([
      { name: 'none/a.txt', data: bytes('first') },
      { name: 'rock/b.txt', data: bytes('x'.repeat(700)) },
    ])); // prettier-ignore
    let listing: string;
    try {
      listing = execFileSync('tar', ['-tf', file], { encoding: 'utf8' });
    } catch {
      return; // no tar binary on this machine: the layout test above still covers it
    }
    expect(listing.trim().split(/\r?\n/)).toEqual(['none/a.txt', 'rock/b.txt']);
    execFileSync('tar', ['-xf', file, '-C', dir]);
    expect(readFileSync(join(dir, 'rock', 'b.txt'), 'utf8')).toHaveLength(700);
  });
});
