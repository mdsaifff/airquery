import { describe, expect, it } from 'vitest';
import { config } from './config.ts';

describe('config', () => {
  it('is an object', () => {
    expect(typeof config).toBe('object');
  });
});
