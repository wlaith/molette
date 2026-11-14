import { forwardRef, type CSSProperties, type HTMLAttributes } from 'react';
import { accentProps, type Accent, type Scale } from '../shared.js';

/**
 * Theme tokens, without the --mo- prefix. font-sans sets font-family instead of a variable, because Molette has
 * no font of its own and should inherit the page's.
 */
export type Token =
  | 'ground' | 'cell' | 'cell-hover' | 'cell-sunk' | 'cell-tint' | 'cell-inverse' | 'line'
  | 'ink' | 'ink-2' | 'on-inverse' | 'on-inverse-2' | 'mark-off' | 'value' | 'focus'
  | 'accent' | 'on-accent' | 'accent-text' | 'accent-soft' | 'accent-soft-ink'
  | 'select' | 'on-select' | 'select-edge' | 'active' | 'on-active'
  | 'ok' | 'ok-text' | 'warn' | 'error' | 'font-sans' | 'font-mono';
export type Tokens = Partial<Record<Token, string>>;

/** Fraction of the cell: none 0 · s 5% · m 10% · l 18%, or a number. */
export type Radius = 'none' | 's' | 'm' | 'l' | number;
const ROUND: Record<Exclude<Radius, number>, number> = { none: 0, s: 0.05, m: 0.1, l: 0.18 };

export interface ThemeProps extends HTMLAttributes<HTMLDivElement> {
  /** Default: inherited, light at the root. */
  appearance?: 'light' | 'dark' | 'auto';
  /** A preset (orange, red, magenta, purple, blue, cyan, teal, green, yellow, ink) or any CSS colour. Default: orange. */
  accent?: Accent;
  /** Colour of value marks (fills, lit ticks, thumbs, switches). Default: ink. */
  marks?: 'ink' | 'accent';
  radius?: Radius;
  /** A Grid or a control's own scale still wins. */
  scale?: Scale;
  tokens?: Tokens;
}

export const Theme = forwardRef<HTMLDivElement, ThemeProps>(function Theme(
  { appearance, accent, marks, radius, scale, tokens, className, style, children, ...rest },
  ref,
) {
  const a = accentProps(accent);
  const vars: Record<string, string | number> = {};
  if (radius !== undefined) vars['--mo-round'] = typeof radius === 'number' ? radius : ROUND[radius];
  for (const [k, v] of Object.entries(tokens ?? {})) {
    if (v === undefined) continue;
    if (k === 'font-sans') vars.fontFamily = v;
    else vars[`--mo-${k}`] = v;
  }
  return (
    <div
      {...rest}
      ref={ref}
      className={['mo', className].filter(Boolean).join(' ')}
      data-theme={appearance}
      data-marks={marks}
      data-scale={scale}
      {...a.attrs}
      style={{ ...a.style, ...vars, ...style } as CSSProperties}
    >
      {children}
    </div>
  );
});
