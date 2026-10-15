import { describe, expect, it } from 'vitest';
import { pickVoice } from './speak.ts';

const v = (name: string, lang = 'en-US') => ({ name, lang });
const windowsChrome = [
  v('Microsoft David - English (United States)'),
  v('Microsoft Zira - English (United States)'),
  v('Google Deutsch', 'de-DE'),
  v('Google UK English Female', 'en-GB'),
  v('Google US English'),
];

describe('pickVoice', () => {
  it('prefers a neural "Natural" voice', () => {
    const edge = [...windowsChrome, v('Microsoft Aria Online (Natural) - English (United States)')];
    expect(pickVoice(edge, null)?.name).toContain('Natural');
  });

  it("falls back to Chrome's Google US English over the robotic Windows defaults", () => {
    expect(pickVoice(windowsChrome, null)?.name).toBe('Google US English');
  });

  it("uses the user's choice when it is installed, else the ranking", () => {
    expect(pickVoice(windowsChrome, 'Microsoft Zira - English (United States)')?.name).toContain('Zira'); // prettier-ignore
    expect(pickVoice(windowsChrome, 'Uninstalled Voice')?.name).toBe('Google US English');
  });

  it('takes any English voice, and gives up on none', () => {
    expect(pickVoice([v('Google Deutsch', 'de-DE'), v('Alex')], null)?.name).toBe('Alex');
    expect(pickVoice([v('Google Deutsch', 'de-DE')], null)).toBeNull();
  });
});
