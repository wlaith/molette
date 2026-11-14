import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type CSSProperties, type HTMLAttributes } from 'react';
import { cellProps, chain, clamp, rangeKey, show, snap, ticks, travelDelay, useControllable, useHelp, useLabel, useValueFit, type Placement } from '../shared.js';
import { Digits, type Roll } from './Digits.js';

export interface SliderProps extends Placement, Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'style' | 'children' | 'defaultValue'> {
  label: string;
  value?: number;
  defaultValue?: number;
  onValueChange?: (value: number) => void;
  /** Fires once per finished change (drag end, key, wheel step, reset), not on every drag move. */
  onValueCommit?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  /** Where the fill starts. Default: 0 if the range crosses zero, else min. */
  origin?: number;
  /** Default: vertical when taller than wide. */
  orient?: 'h' | 'v';
  help?: string;
  disabled?: boolean;
  /** The drag has mass and coasts after a fast release. Off under prefers-reduced-motion. Default: true. */
  inertia?: boolean;
}

export type RangeKind = 'slider' | 'tape' | 'wheel';

type Motion = 'slide' | 'turn';

const SLIDE_ZOOM = 2.5;

// The drum is four ruler-widths wide (see CSS), so a small sweep keeps the ticks comfortably apart.
const WHEEL_SWEEP = 60;
const WHEEL_R = 0.99;

// Distances in CSS px, times in ms.
const CLICK_MS = 250;
const SLOP_MOUSE = 3;
const SLOP_TOUCH = 8;
const TOUCH_CONE = Math.tan((30 * Math.PI) / 180); // steeper than this off-axis is a page scroll, not a drag
const WHEEL_IDLE = 200;
const WHEEL_NOTCH = 50; // mouse wheels send one big delta per notch; trackpads send many small ones
const DRIFT_HOLD = 400;
const DRAG_TAU = 90;
const GLIDE_TAU = 325; // matches the iOS scroll deceleration feel
const GLIDE_WINDOW = 100;
const GLIDE_STILL = 50;
const GLIDE_MIN = 0.2; // px/ms
const GLIDE_END = 0.5; // px
const UP_KEYS = new Set(['ArrowUp', 'ArrowRight', 'PageUp', 'End']);
const DOWN_KEYS = new Set(['ArrowDown', 'ArrowLeft', 'PageDown', 'Home']);

export const fineDivisor = (distance: number) => (distance > 89 ? 16 : distance > 34 ? 4 : 1);

/** Internal engine behind Slider, Tape and Wheel. Use the components. */
export const RangeBase = forwardRef<HTMLDivElement, SliderProps & { kind?: RangeKind }>(function RangeBase(
  {
    label, value, defaultValue, onValueChange, onValueCommit, min = 0, max = 100, step = 1, unit, origin, orient, help, disabled,
    kind = 'slider', inertia = true,
    w = 3, h = 1, x, y, tone, accent, scale, className, style,
    onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onPointerLeave, onLostPointerCapture, onKeyDown, onDoubleClick,
    ...rest
  },
  ref,
) {
  const def = defaultValue ?? (min < 0 && max > 0 ? 0 : min);
  const [v, setV] = useControllable(value, def, onValueChange);
  const motion: Motion = kind === 'wheel' ? 'turn' : 'slide';
  const turns = motion === 'turn';
  const coasts = inertia && !(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const vert = !turns && (orient ? orient === 'v' : h > w);
  const o = clamp(origin ?? (min < 0 && max > 0 ? 0 : min), min, max);

  const el = useRef<HTMLDivElement>(null);
  const ruler = useRef<HTMLDivElement>(null);
  const drum = useRef<HTMLDivElement>(null);
  // `pos` is kept unsnapped so slow drags can accumulate below one step.
  const drag = useRef<{
    id: number; touch: boolean; t0: number; along0: number; across0: number;
    last: number; start: number; pos: number; dragging: boolean; stop: 'min' | 'max' | null;
    trail: { t: number; pos: number }[];
    /** This press stopped a coasting scale, so it's a grab, not a click. */
    caught: boolean;
    shown: number;
    raf: number;
  } | null>(null);
  const glide = useRef<{ raf: number; start: number; value: number } | null>(null);
  useEffect(() => () => { if (glide.current) cancelAnimationFrame(glide.current.raf); }, []);
  const [fine, setFine] = useState(1);
  const [drift, setDrift] = useState<number | null>(null);
  const driftTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(driftTimer.current), []);
  const [hover, setHover] = useState<number | null>(null);
  const rollNext = useRef<Roll>(null);
  const roll = rollNext.current;
  useEffect(() => { rollNext.current = null; });
  const live = useRef({ v, setV, min, max, step, disabled, onValueCommit, vert, turns });
  live.current = { v, setV, min, max, step, disabled, onValueCommit, vert, turns };
  useImperativeHandle(ref, () => el.current!);
  const helpText = useHelp(help, undefined, rest['aria-describedby']);

  // At least 1, so a hidden slider can't divide by zero.
  const rulerLength = () => {
    if (live.current.turns && drum.current) return Math.max(1, (drum.current.offsetWidth / 2) * WHEEL_R * (WHEEL_SWEEP * Math.PI) / 180);
    const r = ruler.current?.getBoundingClientRect();
    return Math.max(1, ((live.current.vert ? r?.height : r?.width) ?? 1) * SLIDE_ZOOM);
  };
  const along = (e: { clientX: number; clientY: number }) => (vert ? -e.clientY : e.clientX);
  const across = (e: { clientX: number; clientY: number }) => (vert ? e.clientX : e.clientY);
  const strayed = (e: { clientX: number; clientY: number }) => {
    const r = el.current!.getBoundingClientRect();
    const [c, lo, hi] = vert ? [e.clientX, r.left, r.right] : [e.clientY, r.top, r.bottom];
    return c < lo ? lo - c : c > hi ? c - hi : 0;
  };
  const capture = (node: HTMLElement, id: number) => {
    try { node.setPointerCapture(id); } catch { /* synthetic or already-released pointer */ }
  };
  const bump = (edge: 'min' | 'max') => {
    const node = el.current;
    if (!node) return;
    node.dataset.stop = edge;
    node.classList.remove('is-stop');
    void node.offsetWidth; // force reflow so the animation restarts on a repeat hit
    node.classList.add('is-stop');
  };

  const stopGlide = () => {
    const g = glide.current;
    if (!g) return false;
    cancelAnimationFrame(g.raf);
    glide.current = null;
    el.current?.classList.remove('is-active');
    clearTimeout(driftTimer.current);
    driftTimer.current = setTimeout(() => setDrift(null), DRIFT_HOLD);
    // Use the coast's own value: its last frame may not have rendered yet.
    if (g.value !== g.start) live.current.onValueCommit?.(g.value);
    return true;
  };
  const stopGlideRef = useRef(stopGlide);
  stopGlideRef.current = stopGlide;

  const startGlide = (pos0: number, reach: number, start: number) => {
    const c = live.current;
    const pxPerUnit = rulerLength() / (c.max - c.min || 1);
    let t0: number | null = null;
    const g = { raf: 0, start, value: c.v };
    const frame = (now: number) => {
      if (glide.current !== g) return; // caught or replaced since this frame was requested
      t0 ??= now;
      const left = reach * Math.exp(-(now - t0) / GLIDE_TAU);
      const raw = pos0 + reach - left;
      const edge = raw > c.max ? 'max' : raw < c.min ? 'min' : null;
      const n = snap(raw, c.min, c.max, c.step);
      g.value = n;
      live.current.setV(n);
      setDrift(n - start);
      if (edge) bump(edge);
      if (edge || Math.abs(left) * pxPerUnit < GLIDE_END) return void stopGlide();
      g.raf = requestAnimationFrame(frame);
    };
    glide.current = g;
    g.raf = requestAnimationFrame(frame);
  };

  const follow = (d: NonNullable<typeof drag.current>) => {
    let prev: number | null = null;
    const frame = (now: number) => {
      if (drag.current !== d) return; // the drag ended since this frame was requested
      const dt = prev === null ? 16 : now - prev;
      prev = now;
      d.shown += (d.pos - d.shown) * (1 - Math.exp(-dt / DRAG_TAU));
      const c = live.current;
      const caughtUp = (Math.abs(d.pos - d.shown) * rulerLength()) / (c.max - c.min || 1) < GLIDE_END;
      if (caughtUp) d.shown = d.pos;
      const n = snap(d.shown, c.min, c.max, c.step);
      c.setV(n);
      setDrift(n - d.start);
      d.raf = caughtUp ? 0 : requestAnimationFrame(frame);
    };
    return frame;
  };

  const releaseSpeed = (trail: { t: number; pos: number }[]) => {
    const last = trail[trail.length - 1];
    if (!last || performance.now() - last.t > GLIDE_STILL) return 0;
    const first = trail.find((p) => last.t - p.t <= GLIDE_WINDOW) ?? trail[0];
    const dt = last.t - first.t;
    return dt > 0 ? (last.pos - first.pos) / dt : 0;
  };

  const setCommit = (n: number) => {
    stopGlide();
    const c = live.current;
    if (n === c.v) return;
    rollNext.current = n > c.v ? 'up' : 'down';
    c.setV(n);
    c.onValueCommit?.(n);
  };

  // Wheel only acts while focused, so it never hijacks page scrolling.
  // Attached by hand because React's onWheel is passive and can't preventDefault.
  useEffect(() => {
    const node = el.current!;
    const w = { pos: 0, start: 0, t: -Infinity, stop: null as 'min' | 'max' | null, timer: undefined as ReturnType<typeof setTimeout> | undefined };
    const onWheel = (e: WheelEvent) => {
      const c = live.current;
      if (document.activeElement !== node || c.disabled) return;
      e.preventDefault();
      stopGlideRef.current();
      const now = performance.now();
      if (now - w.t > WHEEL_IDLE) w.pos = w.start = c.v;
      w.t = now;
      const [dx, dy] = [e.deltaX, e.deltaY];
      // Take the larger axis: some systems turn Shift+wheel into horizontal deltas.
      const amount = Math.abs(dx) > Math.abs(dy) ? dx : -dy;
      if (amount === 0) return;
      let raw: number;
      if (e.deltaMode !== 0 || Math.abs(amount) >= WHEEL_NOTCH) {
        const big = Math.max(c.step, (c.max - c.min) / 10);
        raw = snap(w.pos, c.min, c.max, c.step) + Math.sign(amount) * (e.shiftKey ? big : c.step);
      } else {
        raw = w.pos + (amount * (c.max - c.min)) / rulerLength();
        node.classList.add('is-active'); // disables the easing transition so the thumb tracks the fingers
      }
      const edge = raw > c.max ? 'max' : raw < c.min ? 'min' : null;
      if (edge && edge !== w.stop) bump(edge);
      w.stop = edge;
      w.pos = clamp(raw, c.min, c.max);
      const n = snap(w.pos, c.min, c.max, c.step);
      if (n !== c.v) {
        if (!node.classList.contains('is-active')) rollNext.current = n > c.v ? 'up' : 'down';
        c.setV(n);
      }
      clearTimeout(w.timer);
      w.timer = setTimeout(() => {
        node.classList.remove('is-active');
        w.stop = null;
        const now = live.current;
        if (now.v !== w.start) now.onValueCommit?.(now.v);
      }, WHEEL_IDLE);
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      node.removeEventListener('wheel', onWheel);
      clearTimeout(w.timer);
    };
  }, []);

  const at = (cx: number, cy: number) => {
    const r = ruler.current!.getBoundingClientRect();
    if (turns) {
      const R = Math.max(1, ((drum.current?.offsetWidth ?? 0) / 2) * WHEEL_R);
      const a = (Math.asin(clamp((cx - (r.left + r.width / 2)) / R, -1, 1)) * 180) / Math.PI;
      return snap(v + (a * (max - min)) / WHEEL_SWEEP, min, max, step);
    }
    const off = vert ? (r.top + r.height / 2 - cy) / r.height : (cx - (r.left + r.width / 2)) / r.width;
    return snap(v + (off / SLIDE_ZOOM) * (max - min), min, max, step);
  };

  const endDrag = (commit: boolean, release = false) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    if (d.raf) cancelAnimationFrame(d.raf);
    setFine(1);
    let final = live.current.v;
    if (commit && d.dragging && coasts) {
      const pxPerUnit = rulerLength() / (max - min || 1);
      const vel = release ? releaseSpeed(d.trail) : 0;
      const reach = d.pos - d.shown + (Math.abs(vel) * pxPerUnit >= GLIDE_MIN ? vel * GLIDE_TAU : 0);
      if (Math.abs(reach) * pxPerUnit >= GLIDE_END) return startGlide(d.shown, reach, d.start); // stays .is-active: no easing lag
      final = snap(d.pos, min, max, step);
      setV(final);
    }
    el.current?.classList.remove('is-active');
    // Hold the "+12" briefly after release so it can be read; a cancel clears it at once.
    clearTimeout(driftTimer.current);
    if (commit) driftTimer.current = setTimeout(() => setDrift(null), DRIFT_HOLD);
    else setDrift(null);
    if (d.dragging && commit && final !== d.start) live.current.onValueCommit?.(final);
  };

  const span = max - min || 1;
  const frac = (x: number) => clamp((x - min) / span, 0, 1);
  const [pv, po] = [frac(v), frac(o)];
  const [lo, hi] = [Math.min(v, o), Math.max(v, o)];
  const marks = ticks(min, max, step, turns ? 64 : (vert ? h * 5 : w * 8) * SLIDE_ZOOM);
  // The previous thumb position, so each tick can light as the travelling thumb passes it.
  const shown = useRef(pv);
  const from = shown.current;
  useEffect(() => { shown.current = pv; });
  const delayAt = (at: number) => (pv === from ? 0 : travelDelay((at - from) / (pv - from)));
  const pct = (f: number) => `${Math.round(f * 1e6) / 1e4}%`; // avoid float noise like 55.00000000000001%
  const text = show(v, step, min, max);

  const valueFit = useValueFit(text + (unit ?? ''), v);
  const valueNode = (
    <span className="mo-value" {...valueFit.props}>
      <Digits text={valueFit.compact ?? text} roll={roll} />
      {unit && <span className="mo-unit">{unit}</span>}
    </span>
  );
  const ghost = !turns && hover !== null && hover !== v && drift === null && !drag.current ? hover : null;
  const scaleParts = (
    <>
      <span className="mo-track" />
      {v !== o && <span className="mo-fill" style={{ '--from': pct(Math.min(pv, po)), '--to': pct(Math.max(pv, po)) } as CSSProperties} />}
      {marks.map((t) => (
        <i
          key={t.value}
          style={{ '--at': pct(t.at), '--d': Math.round(delayAt(t.at) * 1000) / 1000 } as CSSProperties}
          className={[t.major && 'maj', v !== o && t.value >= lo && t.value <= hi && 'lit'].filter(Boolean).join(' ') || undefined}
        />
      ))}
      {o !== min && <span className="mo-ref" style={{ '--at': pct(po) } as CSSProperties} />}
      {ghost !== null && <span className="mo-ghost" style={{ '--pos': pct(frac(ghost)) } as CSSProperties} />}
    </>
  );
  const deg = WHEEL_SWEEP / span;
  const rulerNode = turns ? (
    <div className="mo-ruler" ref={ruler}>
      <div className="mo-drum" ref={drum} style={{ '--turn': `${-(v - min) * deg}deg` } as CSSProperties}>
        {marks.map((t) => (
          <i
            key={t.value}
            style={{ '--a': `${(t.value - min) * deg}deg`, '--d': Math.round(delayAt(t.at) * 1000) / 1000 } as CSSProperties}
            className={[t.major && 'maj', v !== o && t.value >= lo && t.value <= hi && 'lit'].filter(Boolean).join(' ') || undefined}
          />
        ))}
      </div>
      <span className="mo-needle" />
    </div>
  ) : (
    <div className="mo-ruler" ref={ruler}>
      <div className="mo-window">
        <div className="mo-strip" style={{ '--pv': pv, '--zoom': SLIDE_ZOOM } as CSSProperties}>{scaleParts}</div>
      </div>
      <span className="mo-thumb" />
    </div>
  );
  const status = [
    fine > 1 && `Fine ×${fine === 4 ? '¼' : '1/16'}`,
    drift !== null && drift !== 0 && show(drift, step, -1, 1),
  ].filter(Boolean).join(' · ') || (ghost !== null ? `→ ${show(ghost, step, min, max)}${unit ? ' ' + unit : ''}` : '');
  // No fit warnings for live status text: it changes on every move.
  const { ref: labelEl, shown: shownLabel } = useLabel([status || label], status || label, 'hide', !status);
  const labelNode = <span ref={labelEl} className="mo-label" hidden={shownLabel === null}>{shownLabel}</span>;

  return (
    <div
      {...rest}
      ref={el}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={v}
      aria-valuetext={`${text}${unit ? ' ' + unit : ''}`}
      aria-orientation={vert ? 'vertical' : 'horizontal'}
      aria-disabled={disabled || undefined}
      data-orient={vert ? 'v' : 'h'}
      data-motion={motion}
      {...cellProps({ w, h, x, y, tone, accent, scale, className, style }, 'mo-slider', kind !== 'slider' && `mo-${kind}`)}
      {...helpText.props}
      onPointerDown={chain(onPointerDown, (e) => {
        if (disabled || e.button !== 0) return;
        const touch = e.pointerType === 'touch' || e.pointerType === 'pen';
        const caught = stopGlide();
        const now = live.current.v;
        drag.current = {
          id: e.pointerId, touch, t0: performance.now(), along0: along(e), across0: across(e),
          last: along(e), start: now, pos: now, dragging: false, stop: null, trail: [], caught, shown: now, raf: 0,
        };
        clearTimeout(driftTimer.current);
        setDrift(null);
        setHover(null);
        // Focus so keys work, but flag it as pointer focus: no focus ring until a key is pressed.
        e.currentTarget.setAttribute('data-pointer', '');
        e.currentTarget.focus({ preventScroll: true });
        // Touch waits for intent before capturing, so a vertical swipe can still scroll the page.
        if (!touch) {
          capture(e.currentTarget, e.pointerId);
          e.preventDefault();
        }
      })}
      onPointerMove={chain(onPointerMove, (e) => {
        const d = drag.current;
        if (!d) {
          if (e.pointerType === 'mouse' && !disabled && !turns && e.buttons === 0) setHover(at(e.clientX, e.clientY));
          return;
        }
        if (e.pointerId !== d.id) return;
        if (!d.dragging) {
          const da = Math.abs(along(e) - d.along0);
          const dc = Math.abs(across(e) - d.across0);
          if (Math.hypot(da, dc) < (d.touch ? SLOP_TOUCH : SLOP_MOUSE)) return;
          if (d.touch && dc > da * TOUCH_CONE) { drag.current = null; return; }
          d.dragging = true;
          capture(e.currentTarget, e.pointerId);
          e.currentTarget.classList.add('is-active');
        }
        const divisor = fineDivisor(strayed(e)) * (e.shiftKey ? 4 : 1);
        setFine(Math.min(16, divisor));
        // The scale moves with the pointer, so dragging right brings lower values to the thumb.
        const raw = d.pos - ((along(e) - d.last) * (max - min)) / rulerLength() / divisor;
        const edge = raw > max ? 'max' : raw < min ? 'min' : null;
        if (edge && edge !== d.stop) bump(edge);
        d.stop = edge;
        d.pos = clamp(raw, min, max);
        d.last = along(e);
        const t = performance.now();
        d.trail.push({ t, pos: d.pos });
        while (d.trail.length > 2 && t - d.trail[0].t > GLIDE_WINDOW * 2) d.trail.shift();
        if (coasts) {
          if (!d.raf) d.raf = requestAnimationFrame(follow(d));
          return;
        }
        const n = snap(d.pos, min, max, step);
        setV(n);
        setDrift(n - d.start);
      })}
      onPointerUp={chain(onPointerUp, (e) => {
        const d = drag.current;
        if (!d || e.pointerId !== d.id) return;
        if (d.dragging) return endDrag(true, true);
        drag.current = null;
        if (!d.caught && performance.now() - d.t0 < CLICK_MS) setCommit(at(e.clientX, e.clientY));
      })}
      onPointerCancel={chain(onPointerCancel, () => endDrag(true))}
      onPointerLeave={chain(onPointerLeave, () => setHover(null))}
      // Fires after pointercancel too, so a cancelled touch can't leave a drag running.
      onLostPointerCapture={chain(onLostPointerCapture, () => endDrag(true))}
      onKeyDown={chain(onKeyDown, (e) => {
        e.currentTarget.removeAttribute('data-pointer');
        if (disabled) return;
        if (e.key === 'Escape' && stopGlide()) return;
        if (e.key === 'Escape' && drag.current) {
          setV(drag.current.start);
          endDrag(false);
          return;
        }
        if (v >= max && UP_KEYS.has(e.key) && e.key !== 'End') bump('max');
        if (v <= min && DOWN_KEYS.has(e.key) && e.key !== 'Home') bump('min');
        rangeKey(e, { value: v, min, max, step, def }, setCommit);
      })}
      onBlur={chain(rest.onBlur, (e) => e.currentTarget.removeAttribute('data-pointer'))}
      onDoubleClick={chain(onDoubleClick, () => !disabled && setCommit(def))}
    >
      {vert ? (
        <>
          {labelNode}
          {rulerNode}
          {valueNode}
        </>
      ) : (
        <>
          <div className="mo-row">
            {labelNode}
            {valueNode}
          </div>
          {rulerNode}
        </>
      )}
      {helpText.node}
    </div>
  );
});

export const Slider = forwardRef<HTMLDivElement, SliderProps>(function Slider(props, ref) {
  return <RangeBase {...props} ref={ref} kind="slider" />;
});
