import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { config } from './config.ts';

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

describe('config', () => {
  it('pins the MediaPipe wasm CDN path to the installed package version', () => {
    const pkg = JSON.parse(read('../node_modules/@mediapipe/tasks-vision/package.json')) as {
      version: string;
    };
    expect(config.mediapipeVersion).toBe(pkg.version);
  });
});

describe('module boundaries', () => {
  it('src/tracking has no React imports', () => {
    const dir = new URL('./tracking/', import.meta.url);
    for (const file of readdirSync(dir)) {
      expect(read(`./tracking/${file}`), file).not.toMatch(/from ['"]react/);
    }
  });
});
