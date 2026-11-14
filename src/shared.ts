import { createElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

export type Scale = 'xs' | 's' | 'm' | 'l' | 'xl';
export type Tone = 'default' | 'sunk' | 'inverse' | 'accent' | 'slot';

/**
 * Accent presets: mid-tone colours that hold up on light and dark cells. The tints (selection, soft fills,
 * accent text, the ink on an accent fill) are mixed from the one colour in CSS, against the theme's cell and ink.
 */
export const ACCENTS = {
  orange: '#ff832b', red: '#fa4d56', magenta: '#ee5396', purple: '#a56eff', blue: '#4589ff',
  cyan: '#1192e8', teal: '#009d9a', green: '#24a148', yellow: '#f1c21b', ink: 'var(--mo-ink)',
} as const;
/** A preset name, or any CSS colour ("#0af", "oklch(0.7 0.15 250)"). */
export type Accent = keyof typeof ACCENTS | (string & {});

/** data-accent and the base colour for an accent. Presets are named in data-accent; any other colour is "custom". */
export function accentProps(accent: Accent | undefined) {
  if (!accent) return { attrs: {}, style: {} };
  const preset = (ACCENTS as Record<string, string>)[accent];
  return {
    attrs: { 'data-accent': preset ? accent : 'custom' },
    style: { '--mo-accent-base': preset ?? accent } as CSSProperties,
  };
}

/** Size and placement in cells. Leave x/y out to let a grid flow the cell; outside a grid, w/h still size it. */
export interface Placement {
  /** Cell scale for this control alone. Default: the nearest ancestor's data-scale (a Grid sets one), else m. */
  scale?: Scale;
  w?: number;
  h?: number;
  x?: number;
  y?: number;
  tone?: Tone;
  /**
   * This control's accent: a preset or any CSS colour. Its marks (fill, lit ticks, thumb, switch) and selection
   * take the colour. To colour a whole board, use Theme.
   */
  accent?: Accent;
  className?: string;
  style?: CSSProperties;
}

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Snap to the step, clamp, and drop float noise (0.1 + 0.2). */
export const snap = (v: number, min: number, max: number, step: number) =>
  Math.round(clamp(Math.round(v / step) * step, min, max) * 1000) / 1000;

/** className, style and data-x for a cell. Every component goes through this. */
export function cellProps(p: Placement, ...extra: (string | false | undefined)[]) {
  const { w = 1, h = 1, x, y, tone = 'default', accent, scale, className, style } = p;
  const placed = x != null && y != null;
  const a = accentProps(accent);
  return {
    className: ['mo-cell', tone !== 'default' && `mo-cell--${tone}`, ...extra, className].filter(Boolean).join(' '),
    style: { '--w': w, '--h': h, ...(placed ? { '--x': x, '--y': y } : {}), ...a.style, ...style } as CSSProperties,
    ...a.attrs,
    ...(accent ? { 'data-marks': 'accent' } : {}),
    ...(placed ? { 'data-x': '' } : {}),
    // Two cells or wider: at dense scales the cell lays out in one row (label left, value or icon right).
    ...(w >= 2 ? { 'data-wide': '' } : {}),
    ...(scale ? { 'data-scale': scale } : {}),
  };
}

/**
 * Help text: native tooltip plus a screen-reader description. `sr` is extra text for screen readers only.
 * The description lives in a hidden span that aria-describedby points at (read by every screen reader,
 * unlike aria-description). `describedBy` is the user's own aria-describedby, kept in front of ours.
 * Spread `props` on the element and render `node` inside it.
 */
export function useHelp(help?: string, sr?: string, describedBy?: string) {
  const id = useId();
  const desc = [help, sr].filter(Boolean).join('. ');
  const ids = [describedBy, desc && id].filter(Boolean).join(' ');
  return {
    props: {
      ...(help ? { title: help } : {}),
      ...(ids ? { 'aria-describedby': ids } : {}),
    } as Record<string, string>,
    node: desc ? createElement('span', { id, hidden: true }, desc) : null,
  };
}

/**
 * Text that never truncates. A control's text has fallbacks (e.g. "Playing" → "Play" → "Pl"); this picks the
 * first one that fits. `els` returns the elements whose text must fit; while any of them overflows, step to the
 * next fallback. When the container is resized, start again from the longest. Returns the fallback index.
 * `key` changes whenever the fallbacks themselves change. With no layout (SSR, tests), it stays at 0.
 */
export function useFit(els: () => (HTMLElement | null)[], count: number, key: string) {
  const [i, setI] = useState(0);
  useLayoutEffect(() => setI(0), [key]);
  // No deps on purpose: re-measure after every render. Bounded by `count`, so it can't loop.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (i >= count - 1) return;
    if (els().some((el) => el && el.scrollWidth > el.clientWidth + 0.5)) setI(i + 1);
  });
  useEffect(() => {
    const list = els().filter((el): el is HTMLElement => !!el);
    const box = list[0]?.closest('.mo-cell');
    if (!box || typeof ResizeObserver === 'undefined') return;
    // -1, so the first report (the size once the Grid has fitted its columns) also starts again from the longest.
    let w = -1;
    const over = () => list.some((el) => el.scrollWidth > el.clientWidth + 0.5);
    // The cell got wider or narrower: start again from the longest text.
    const cell = new ResizeObserver(() => {
      if (box.clientWidth === w) return;
      w = box.clientWidth;
      setI(0);
    });
    // The text's own box changed without the cell resizing (the scale went dense, a font loaded): only step on.
    // Stepping is bounded by `count`, so this can't loop.
    const text = new ResizeObserver(() => { if (over()) setI((n) => Math.min(n + 1, count - 1)); });
    cell.observe(box);
    list.forEach((el) => text.observe(el));
    return () => { cell.disconnect(); text.disconnect(); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return Math.min(i, Math.max(0, count - 1));
}

/**
 * Generated short forms of a label, longest first: its first word, its first three letters, its first letter.
 * "Snap to grid" → "Snap", "Sna", "S". The last one fits any cell, so a chain that ends here never truncates.
 */
export function abbreviate(text: string): string[] {
  const t = text.trim();
  const first = t.split(/\s+/)[0] ?? '';
  return [...new Set([first, first.slice(0, 3), first.slice(0, 1)])].filter((s) => s && s !== t);
}

declare const process: { env: { NODE_ENV?: string } };

const warned = new Set<string>();
/** Dev-only: a label had to fall back to a generated form. Once per message. */
export function warnFallback(label: string, shown: string | null | undefined, value = false) {
  // Written literally so the app's bundler replaces it at build time; browsers have no `process` at runtime.
  let prod = false;
  try { prod = process.env.NODE_ENV === 'production'; } catch { /* no bundler (e.g. CDN): treat as dev */ }
  if (prod) return;
  const msg = value
    ? `Molette: the value "${label}" doesn't fit its cell even at its smallest size. Give the control a wider cell (w).`
    : shown === null
    ? `Molette: "${label}" doesn't fit its cell and is hidden. Give it a \`short\` form or a wider cell (w).`
    : `Molette: "${label}" doesn't fit its cell and is shown as "${shown}". Give it a \`short\` form or a wider cell (w).`;
  if (warned.has(msg)) return;
  warned.add(msg);
  console.warn(msg);
}

/**
 * A label that is never cut off. `given` are the author's forms, longest first (e.g. [onLabel, label, short]);
 * `end` says what comes after them: generated abbreviations down to one letter ('letter'), down to three letters
 * then hidden ('hide'), or straight to hidden because an icon carries the meaning ('icon'). Every chain ends in
 * something that fits, so text is never clipped or ellipsised. Using a generated form warns in development.
 * Returns the ref for the label element and what to show (null: hide it).
 */
export function useLabel(given: (string | null | undefined)[], label: string, end: 'letter' | 'hide' | 'icon', warn = true) {
  const authored = [...new Set(given.filter((t): t is string => !!t))];
  const gen = end === 'icon' ? [] : abbreviate(label).filter((s) => end === 'letter' || s.length >= 3);
  const chain: (string | null)[] = [...authored, ...gen.filter((s) => !authored.includes(s))];
  if (end !== 'letter') chain.push(null);
  const ref = useRef<HTMLSpanElement>(null);
  const i = useFit(() => [ref.current], chain.length, chain.join('|'));
  const shown = chain[i] ?? null;
  const generated = i >= authored.length && !(end === 'icon' && shown === null);
  useEffect(() => { if (warn && generated) warnFallback(label, shown); }, [warn, generated, label, shown]);
  return { ref, shown };
}

/** 14400 → "14.4K", 2500000 → "2.5M". Only for numbers of 1000 or more; smaller ones are already short. */
export const compactNumber = (n: number) =>
  Math.abs(n) < 1000 ? undefined : new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n).replace('-', '−');

/**
 * A value that is never cut off. Numbers can't be abbreviated like words, so a value that doesn't fit steps
 * through data-fit levels: 1 drops the unit (it stays in aria-valuetext), 2 writes a large number compactly
 * ("14.4K"), 3 sets it at 0.8 of its size, 4 at 0.618. `key` is the value's text, so each new value starts again
 * at full size. Spread `props` on .mo-value and show `compact` instead of the text when it is set.
 * If even the last level overflows, it warns in development: the cell is too small for that value.
 */
export function useValueFit(key: string, n?: number) {
  const ref = useRef<HTMLSpanElement>(null);
  const fit = useFit(() => [ref.current], 5, key);
  useEffect(() => {
    const el = ref.current;
    if (fit === 4 && el && el.scrollWidth > el.clientWidth + 0.5) warnFallback(key, undefined, true);
  }, [fit, key]);
  return { props: { ref, 'data-fit': fit || undefined }, compact: fit >= 2 && n !== undefined ? compactNumber(n) : undefined };
}

/** Run the user's handler, then ours (unless the user called preventDefault). */
export function chain<E extends { defaultPrevented: boolean }>(user: ((e: E) => void) | undefined, ours: (e: E) => void) {
  return (e: E) => {
    user?.(e);
    if (!e.defaultPrevented) ours(e);
  };
}

/** Controlled when `value` is given, uncontrolled otherwise. */
export function useControllable<T>(value: T | undefined, initial: T, onChange?: (v: T) => void) {
  const [inner, setInner] = useState(initial);
  const controlled = value !== undefined;
  const current = controlled ? value : inner;
  const ref = useRef(current);
  ref.current = current;
  const set = useCallback(
    (next: T) => {
      if (Object.is(next, ref.current)) return;
      ref.current = next;
      if (!controlled) setInner(next);
      onChange?.(next);
    },
    [controlled, onChange],
  );
  return [current, set] as const;
}

/** Arrow / Page / Home / End / Delete keys for any range control. Returns true if handled. */
export function rangeKey(
  e: { key: string; shiftKey: boolean; preventDefault(): void },
  r: { value: number; min: number; max: number; step: number; def: number },
  set: (v: number) => void,
) {
  const big = Math.max(r.step, (r.max - r.min) / 10);
  const map: Record<string, number | undefined> = {
    ArrowUp: e.shiftKey ? big : r.step, ArrowRight: e.shiftKey ? big : r.step,
    ArrowDown: -(e.shiftKey ? big : r.step), ArrowLeft: -(e.shiftKey ? big : r.step),
    PageUp: big, PageDown: -big,
  };
  let next: number | undefined;
  if (map[e.key] !== undefined) next = r.value + map[e.key]!;
  else if (e.key === 'Home') next = r.min;
  else if (e.key === 'End') next = r.max;
  else if (e.key === 'Delete' || e.key === 'Backspace') next = r.def;
  if (next === undefined) return false;
  e.preventDefault();
  set(snap(next, r.min, r.max, r.step));
  return true;
}

/** --mo-ease-productive as numbers: cubic-bezier(0.2, 0, 0.38, 0.9). Keep in step with the token in styles.css. */
const EASE = [0.2, 0, 0.38, 0.9] as const;
const bez = (s: number, a: number, b: number) => 3 * (1 - s) * (1 - s) * s * a + 3 * (1 - s) * s * s * b + s * s * s;

/**
 * When an eased travel reaches progress p (0..1), as a fraction of its duration.
 * Used to light each ruler tick at the moment the moving thumb passes it.
 */
export function travelDelay(p: number) {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  let lo = 0, hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (bez(mid, EASE[1], EASE[3]) < p) lo = mid; else hi = mid;
  }
  return bez((lo + hi) / 2, EASE[0], EASE[2]);
}

/** Decimal places in a step: 1 → 0, 0.5 → 1, 0.01 → 2, 1e-7 → 7. */
export const places = (step: number) => {
  const s = String(step);
  if (s.includes('e-')) return Number(s.split('e-')[1]);
  return s.split('.')[1]?.length ?? 0;
};

/**
 * How a value is shown. Three rules, the same for every control:
 * decimals follow the step (step 0.01 → "137.51", never "137.5" or "137.508");
 * negatives take a true minus sign (U+2212), not a hyphen;
 * on a range that crosses zero, positives take "+", so +12 and −12 line up.
 */
export const show = (v: number, step: number, min: number, max: number) => {
  const digits = Math.abs(v).toFixed(places(step));
  if (Number(digits) === 0) return digits;
  if (v < 0) return '−' + digits;
  return (min < 0 && max > 0 ? '+' : '') + digits;
};

/**
 * Ruler ticks that mean something: one per round interval of the value (1, 2, 2.5 or 5 × 10ⁿ),
 * about `target` of them across the range, never finer than the step. Majors fall on 5× the interval
 * (4× for 2.5, so 2.5 → 10). Returns each tick's value, its position 0..1, and whether it is major.
 */
export function ticks(min: number, max: number, step: number, target: number) {
  const span = max - min;
  if (!(span > 0)) return [];
  const raw = span / Math.max(1, target);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const mant = [1, 2, 2.5, 5, 10].find((m) => m * mag >= raw * (1 - 1e-9))!;
  const every = Math.max(mant * mag, step);
  const major = every * (mant === 2.5 ? 4 : 5);
  const near = (x: number) => Math.abs(x - Math.round(x)) < 1e-6;
  const out: { value: number; at: number; major: boolean }[] = [];
  for (let i = Math.ceil(min / every - 1e-9); i * every <= max + every * 1e-9; i++) {
    const value = Math.round(i * every * 1e9) / 1e9 + 0; // + 0 turns −0 into 0
    out.push({ value, at: (value - min) / span, major: near(value / major) });
  }
  return out;
}
