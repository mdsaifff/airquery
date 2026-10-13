// Bring your own CSV: drop a file anywhere, confirm which columns are lat / lon
// (and optionally height), then explore it like the built-in scenes.
import { useEffect, useState } from 'react';
import type { CsvMapping } from '../data/csvSchema.ts';
import type { CsvImport } from '../scene/loadCsv.ts';
import { toast } from './store.ts';

interface Props {
  importCsv(file: File): Promise<CsvImport>;
  finishCsv(imp: CsvImport, mapping: CsvMapping): Promise<void>;
}

export function CsvDrop({ importCsv, finishCsv }: Props) {
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState<CsvImport | null>(null);
  const [mapping, setMapping] = useState<CsvMapping>({ lat: '', lon: '', height: null });

  useEffect(() => {
    const over = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      setDragging(true);
    };
    const leave = (e: DragEvent) => {
      if (e.relatedTarget === null) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer?.files[0];
      if (!file) return;
      if (!/\.(csv|tsv|txt)$/i.test(file.name)) return toast('error', 'Drop a .csv file.');
      importCsv(file)
        .then((imp) => {
          setPending(imp);
          setMapping({
            lat: imp.guess.lat ?? imp.numericColumns[0] ?? '',
            lon: imp.guess.lon ?? imp.numericColumns[1] ?? '',
            height: null,
          });
        })
        .catch((err: unknown) => toast('error', `Could not read ${file.name}: ${String(err)}`));
    };
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, [importCsv]);

  if (dragging) return <div className="dropzone">Drop a CSV with latitude / longitude columns</div>;
  if (!pending) return null;
  const cols = pending.numericColumns;
  const select = (key: 'lat' | 'lon') => (
    <select
      value={mapping[key]}
      onChange={(e) => setMapping({ ...mapping, [key]: e.target.value })}
    >
      {cols.map((c) => (
        <option key={c}>{c}</option>
      ))}
    </select>
  );
  const ready = mapping.lat && mapping.lon && mapping.lat !== mapping.lon;
  return (
    <section className="panel csv" aria-label="Map CSV columns">
      <h2>{pending.fileName}</h2>
      <div className="label">
        {pending.base.numRows.toLocaleString()} rows · which columns place each row?
      </div>
      {cols.length < 2 ? (
        <p>This file needs two numeric columns (latitude and longitude).</p>
      ) : (
        <>
          <label>latitude {select('lat')}</label>
          <label>longitude {select('lon')}</label>
          <label>
            height
            <select
              value={mapping.height ?? ''}
              onChange={(e) => setMapping({ ...mapping, height: e.target.value || null })}
            >
              <option value="">none</option>
              {cols
                .filter((c) => c !== mapping.lat && c !== mapping.lon)
                .map((c) => (
                  <option key={c}>{c}</option>
                ))}
            </select>
          </label>
        </>
      )}
      <div className="row">
        <button
          disabled={!ready}
          onClick={() => {
            const imp = pending;
            setPending(null);
            void finishCsv(imp, mapping);
          }}
        >
          show on the globe
        </button>
        <button onClick={() => setPending(null)}>cancel</button>
      </div>
    </section>
  );
}
