// Pure: split the glass box's spec and SQL text into coloured tokens.
export type Token = { text: string; kind: 'key' | 'str' | 'num' | 'kw' | 'plain' };

function tokenize(
  text: string,
  re: RegExp,
  kindOf: (m: RegExpMatchArray) => Token['kind'],
): Token[] {
  const out: Token[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ text: text.slice(last, at), kind: 'plain' });
    out.push({ text: m[0], kind: kindOf(m) });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), kind: 'plain' });
  return out;
}

const SPEC_RE = /("(?:[^"\\]|\\.)*")|(-?\b\d+(?:\.\d+)?\b)|(\b[a-z_]+(?=:))/g;
export const highlightSpec = (text: string): Token[] =>
  tokenize(text, SPEC_RE, (m) => (m[1] ? 'str' : m[2] ? 'num' : 'key'));

const SQL_RE =
  /(\b(?:SELECT|FROM|WHERE|AND|OR|NOT|ORDER BY|LIMIT|BETWEEN|IN|ILIKE|ASC|DESC|AS)\b)|(\?|-?\b\d+(?:\.\d+)?\b)|('(?:[^']|'')*')/g;
export const highlightSql = (text: string): Token[] =>
  tokenize(text, SQL_RE, (m) => (m[1] ? 'kw' : m[2] ? 'num' : 'str'));
