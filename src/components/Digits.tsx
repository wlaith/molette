import { useEffect, useRef } from 'react';

export type Roll = 'up' | 'down' | null;

/**
 * Odometer-style digits. Controls set `roll` only for discrete changes (keys, clicks, resets, wheel notches):
 * rolling on every drag frame, or when code drives the value, would be noise.
 * Characters compare from the right, so 99 → 100 rolls every digit.
 */
export function Digits({ text, roll }: { text: string; roll: Roll }) {
  // Kept until the text changes again, so an unrelated re-render mid-roll reproduces the same keys and doesn't restart it.
  const last = useRef({ text, from: text, dir: null as Roll });
  let change = last.current;
  if (text !== change.text) change = { text, from: change.text, dir: roll };
  useEffect(() => {
    last.current = change;
  });

  return (
    <>
      {[...text].map((ch, i) => {
        const pos = text.length - 1 - i;
        const old = change.from[change.from.length - 1 - pos] ?? '';
        const moved = change.dir !== null && old !== ch;
        return (
          <span key={moved ? `${pos}:${change.text}` : pos} className="mo-digit" data-roll={moved ? change.dir! : undefined}>
            <span data-from={moved ? old : undefined}>{ch}</span>
          </span>
        );
      })}
    </>
  );
}
