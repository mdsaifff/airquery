// Voice picker (V): choose which installed voice reads "what's this?" summaries.
import { useEffect, useState } from 'react';
import { pickVoice, preferredVoice, setPreferredVoice, speak, voices } from '../voice/speak.ts';

const SAMPLE =
  'This cluster has 569 earthquakes, 216 kilometres deep on average, mostly near Vanuatu.';

export function VoicePanel() {
  const [list, setList] = useState(voices);
  const [chosen, setChosen] = useState(() => pickVoice(voices(), preferredVoice())?.name ?? '');

  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const update = () => {
      setList(voices());
      setChosen((c) => c || (pickVoice(voices(), preferredVoice())?.name ?? ''));
    };
    window.speechSynthesis.addEventListener('voiceschanged', update);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', update);
  }, []);

  // English first, then the rest, each alphabetically.
  const sorted = [...list].sort(
    (a, b) =>
      Number(b.lang.startsWith('en')) - Number(a.lang.startsWith('en')) ||
      a.name.localeCompare(b.name),
  );

  return (
    <section className="panel voice" aria-label="Voice">
      <h2>Voice</h2>
      {sorted.length === 0 ? (
        <p>This browser has no speech voices.</p>
      ) : (
        <>
          <div className="row">
            <select
              aria-label="Voice"
              value={chosen}
              onChange={(e) => {
                setChosen(e.target.value);
                setPreferredVoice(e.target.value);
                speak(SAMPLE);
              }}
            >
              {sorted.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
            <button onClick={() => speak(SAMPLE)}>test</button>
          </div>
          <p className="label">
            “Google” voices sound most natural in Chrome. They are generated online, so the spoken
            text (never your microphone) goes to Google.
          </p>
        </>
      )}
    </section>
  );
}
