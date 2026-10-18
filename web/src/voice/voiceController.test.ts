import { describe, expect, it } from 'vitest';
import { FakeSpeechToText } from './fakeSpeechToText.ts';
import { VoiceController } from './voiceController.ts';

function rig() {
  const stt = new FakeSpeechToText();
  const log: string[] = [];
  const submitted: string[] = [];
  const voice = new VoiceController(
    stt,
    {
      transcript: (t, final) => log.push(`${final ? 'final' : 'interim'}:${t}`),
      listening: (a) => log.push(a ? 'listening' : 'idle'),
      ready: () => log.push('ready'),
      error: (m) => log.push(`error:${m}`),
    },
    (u) => submitted.push(u),
  );
  return { stt, voice, log, submitted };
}

describe('VoiceController', () => {
  it('push-to-talk: interim transcript while held, submit on release', () => {
    const { stt, voice, log, submitted } = rig();
    stt.script = 'colour them by magnitude';
    voice.setListening(true);
    expect(stt.listening).toBe(true);
    expect(submitted).toEqual([]);
    voice.setListening(false);
    expect(stt.listening).toBe(false);
    expect(submitted).toEqual(['colour them by magnitude']);
    expect(log).toEqual([
      'listening',
      'interim:',
      'ready',
      'interim:colour',
      'interim:colour them',
      'interim:colour them by',
      'idle',
      'final:colour them by magnitude',
    ]);
  });

  it('a warmed-up mic that becomes talk keeps the words heard while the hand came up', () => {
    const { stt, voice, log, submitted } = rig();
    stt.script = 'only sponges';
    voice.prime(true);
    expect(stt.listening).toBe(true);
    expect(log).toEqual([]); // nothing shown until talk is confirmed
    voice.setListening(true);
    expect(log).toEqual(['listening', 'interim:only', 'ready']);
    voice.setListening(false);
    expect(submitted).toEqual(['only sponges']);
  });

  it('a warmed-up mic that never becomes talk is dropped: nothing shown, nothing sent', () => {
    const { stt, voice, log, submitted } = rig();
    stt.script = 'just chatting';
    voice.prime(true);
    voice.prime(false);
    expect(stt.listening).toBe(false);
    expect(log).toEqual([]);
    expect(submitted).toEqual([]);
  });

  it('switching the warm-up off while listening does not cut the question', () => {
    const { stt, voice, submitted } = rig();
    stt.script = 'deeper than 3 km';
    voice.prime(true);
    voice.setListening(true);
    voice.prime(false);
    expect(stt.listening).toBe(true);
    voice.setListening(false);
    expect(submitted).toEqual(['deeper than 3 km']);
  });

  it('does not submit an empty transcript', () => {
    const { stt, voice, submitted } = rig();
    stt.script = '   ';
    voice.setListening(true);
    voice.setListening(false);
    expect(submitted).toEqual([]);
  });

  it('ignores repeated listening signals', () => {
    const { stt, voice, submitted } = rig();
    stt.script = 'undo';
    voice.setListening(true);
    voice.setListening(true);
    voice.setListening(false);
    voice.setListening(false);
    expect(submitted).toEqual(['undo']);
  });

  it('typed input always works, even without speech recognition', () => {
    const { stt, voice, log, submitted } = rig();
    stt.available = false;
    voice.setListening(true);
    expect(log.at(-1)).toMatch(/^error:No speech recognition/);
    voice.typed('  show the ten strongest ');
    expect(submitted).toEqual(['show the ten strongest']);
    voice.typed('   ');
    expect(submitted).toHaveLength(1);
  });
});
