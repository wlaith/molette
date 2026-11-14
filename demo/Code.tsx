import { Fragment, type ReactNode } from 'react';

// One pass over the source: strings, comments, JSX tags, prop names, numbers. Enough for the snippets on this page.
const TOKEN = /("[^"\n]*"|'[^'\n]*')|(\/\/[^\n]*|#[^\n]*)|(<\/?[A-Za-z][\w.]*|\/?>)|(\b[a-zA-Z-]+(?==))|(\b\d+(?:\.\d+)?\b)/g;
const KIND = ['', 'str', 'com', 'tag', 'attr', 'num'];

function highlight(src: string) {
  const out: ReactNode[] = [];
  let at = 0;
  for (const m of src.matchAll(TOKEN)) {
    if (m.index! > at) out.push(src.slice(at, m.index));
    const k = m.slice(1).findIndex(Boolean) + 1;
    out.push(<span key={m.index} className={`t-${KIND[k]}`}>{m[0]}</span>);
    at = m.index! + m[0].length;
  }
  out.push(src.slice(at));
  return out.map((n, i) => <Fragment key={i}>{n}</Fragment>);
}

export function Code({ children, className }: { children: string; className?: string }) {
  return (
    <pre className={['code', className].filter(Boolean).join(' ')}>
      <code>{highlight(children)}</code>
    </pre>
  );
}
