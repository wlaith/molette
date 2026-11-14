import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import { cellProps, useLabel, useValueFit, type Placement, type Scale } from '../shared.js';

export interface GridProps extends HTMLAttributes<HTMLDivElement> {
  /** Cell size: xs 34 · s 55 · m 89 · l 144 · xl 233 px. Default m. */
  scale?: Scale;
  /** Default 8. "auto" picks the most of 13, 8 or 5 that fit; cells then flow in order and x/y are ignored. */
  cols?: number | 'auto';
  /** Stretch cells to the container's width. With cols="auto", `scale` is the smallest cell before dropping columns. */
  fluid?: boolean;
}

// Fallback when the --mo-cell-* tokens can't be read.
const CELL: Record<Scale, number> = { xs: 34, s: 55, m: 89, l: 144, xl: 233 };
const DENSE_BELOW = (CELL.xs + CELL.s) / 2;

function innerWidth(el: HTMLElement) {
  const cs = getComputedStyle(el);
  return el.clientWidth - parseFloat(cs.paddingLeft || '0') - parseFloat(cs.paddingRight || '0');
}

const keyboardFocus = (el: Element) => {
  try { return el.matches(':focus-visible') && !el.hasAttribute('data-pointer'); } catch { return false; } // :focus-visible unsupported
};

/**
 * Keyboard focus is drawn by one ring that slides between cells, instead of an outline that blinks out on one
 * cell and in on the next.
 */
export const Grid = forwardRef<HTMLDivElement, GridProps>(function Grid(
  { scale = 'm', cols = 8, fluid, className, style, children, ...rest },
  ref,
) {
  const node = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLSpanElement>(null);
  useImperativeHandle(ref, () => node.current!);
  const auto = cols === 'auto';

  // Layout effect so the first painted frame already has the right column count.
  useLayoutEffect(() => {
    const g = node.current!;
    const box = g.parentElement;
    if ((!auto && !fluid) || !box) return;
    const fit = () => {
      const cs = getComputedStyle(g);
      const gap = parseFloat(cs.getPropertyValue('--g')) || 8;
      // Read --cell rather than the scale prop: CSS bumps xs to s on touch screens.
      const cell = parseFloat(cs.getPropertyValue('--cell')) || CELL[scale];
      const avail = innerWidth(box);
      let n = typeof cols === 'number' ? cols : 8;
      if (auto) {
        const tok = (name: string, d: number) => parseInt(cs.getPropertyValue(name), 10) || d;
        const steps = [tok('--mo-cols-wide', 13), tok('--mo-cols-regular', 8), tok('--mo-cols-compact', 5)];
        const fits = (c: number) => c * cell + (c - 1) * gap <= avail + 0.5;
        n = steps.find(fits) ?? Math.max(1, Math.floor((avail + gap) / (cell + gap)));
        g.style.setProperty('--cols', String(n));
      }
      if (fluid) g.toggleAttribute('data-dense', (avail - (n - 1) * gap) / n < DENSE_BELOW);
    };
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    return () => ro.disconnect();
  }, [auto, fluid, cols, scale]);

  useEffect(() => {
    const g = node.current!;
    const r = ring.current!;
    let on: HTMLElement | null = null;
    const hide = () => {
      on = null;
      r.removeAttribute('data-on');
      g.removeAttribute('data-ring');
    };
    const place = (glide: boolean) => {
      if (!on) return;
      const a = g.getBoundingClientRect();
      const b = on.getBoundingClientRect();
      r.toggleAttribute('data-jump', !glide);
      r.style.transform = `translate(${b.left - a.left - 2}px, ${b.top - a.top - 2}px)`;
      r.style.width = `${b.width + 4}px`;
      r.style.height = `${b.height + 4}px`;
    };
    const onIn = (e: FocusEvent) => {
      const t = e.target as HTMLElement;
      if (!t.classList.contains('mo-cell') || !keyboardFocus(t)) return hide();
      const glide = on !== null;
      on = t;
      place(glide);
      r.setAttribute('data-on', '');
      g.setAttribute('data-ring', '');
    };
    const onOut = (e: FocusEvent) => {
      if (!g.contains(e.relatedTarget as Node | null)) hide();
    };
    // The focused cell may not change on a press, so focusin alone can't tell us the pointer took over.
    const onPointer = () => hide();
    const onKey = () => {
      const t = document.activeElement as HTMLElement | null;
      if (!t || !g.contains(t) || !t.classList.contains('mo-cell') || on === t) return;
      t.removeAttribute('data-pointer');
      onIn({ target: t } as unknown as FocusEvent);
    };
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => place(false));
    resize?.observe(g);
    g.addEventListener('focusin', onIn);
    g.addEventListener('focusout', onOut);
    g.addEventListener('pointerdown', onPointer, true);
    g.addEventListener('keydown', onKey, true);
    return () => {
      resize?.disconnect();
      g.removeEventListener('focusin', onIn);
      g.removeEventListener('focusout', onOut);
      g.removeEventListener('pointerdown', onPointer, true);
      g.removeEventListener('keydown', onKey, true);
    };
  }, []);

  const grid = (
    <div
      ref={node}
      className={['mo', 'mo-grid', className].filter(Boolean).join(' ')}
      data-scale={scale}
      data-fit={fluid ? 'fluid' : undefined}
      data-auto={auto ? '' : undefined}
      style={{ ...(auto ? {} : { '--cols': cols }), ...style } as CSSProperties}
      {...rest}
    >
      {children}
      <span ref={ring} className="mo-ring" aria-hidden="true" />
    </div>
  );
  return fluid ? <div className="mo-board">{grid}</div> : grid;
});

export interface CellProps extends Placement, Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'style'> {}

export const Cell = forwardRef<HTMLDivElement, CellProps>(function Cell(
  { w, h, x, y, tone, accent, scale, className, style, children, ...rest },
  ref,
) {
  return (
    <div ref={ref} {...cellProps({ w, h, x, y, tone, accent, scale, className, style })} {...rest}>
      {children}
    </div>
  );
});

export interface ReadoutProps {
  label: string;
  value: ReactNode;
  unit?: string;
}

export function Readout({ label, value, unit }: ReadoutProps) {
  // The label gives way rather than the value: the value is what a readout is for.
  const { ref: labelEl, shown } = useLabel([label], label, 'hide');
  const valueFit = useValueFit(String(typeof value === 'string' || typeof value === 'number' ? value : '') + (unit ?? ''), typeof value === 'number' ? value : undefined);
  return (
    <>
      <span ref={labelEl} className="mo-label" hidden={shown === null}>{shown}</span>
      <span className="mo-value" {...valueFit.props}>
        {valueFit.compact ?? value}
        {unit && <span className="mo-unit">{unit}</span>}
      </span>
    </>
  );
}
