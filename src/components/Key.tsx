import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cellProps, chain, useControllable, useHelp, useLabel, type Placement } from '../shared.js';

type ButtonAttrs = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'style' | 'children' | 'type' | 'disabled'>;

interface Base extends Placement, ButtonAttrs {
  label: string;
  /** A 24×24 SVG glyph. Give it className="mo-glyph". */
  icon?: ReactNode;
  help?: string;
  disabled?: boolean;
  primary?: boolean;
  /** Shown only when the label doesn't fit, e.g. "Sv" for "Save". */
  short?: string;
}

export interface MomentaryKeyProps extends Base {
  mode?: 'momentary';
  onPress?: () => void;
}

export interface LatchKeyProps extends Base {
  mode: 'latch';
  pressed?: boolean;
  defaultPressed?: boolean;
  onPressedChange?: (pressed: boolean) => void;
  /** A running process (Play, Record): fills green while on. */
  process?: boolean;
  onLabel?: string;
}

export interface HoldKeyProps extends Base {
  mode: 'hold';
  onConfirm: () => void;
  /** Offer Undo for this many ms after confirming. */
  undoMs?: number;
  onUndo?: () => void;
}

export type KeyProps = MomentaryKeyProps | LatchKeyProps | HoldKeyProps;
type AllKeyProps = Base & Partial<Omit<MomentaryKeyProps, keyof Base>> & Partial<Omit<LatchKeyProps, keyof Base>> & Partial<Omit<HoldKeyProps, keyof Base>>;

export const Key = forwardRef<HTMLButtonElement, KeyProps>(function Key(props, ref) {
  const {
    label, short, icon, help, disabled, primary, w, h, x, y, tone, accent, scale, className, style,
    mode: _mode, onPress, pressed: pressedProp, defaultPressed, onPressedChange, process, onLabel, onConfirm, undoMs, onUndo,
    onClick: userClick, onPointerDown: userDown, onPointerUp: userUp, onPointerLeave: userLeave, onPointerCancel: userCancel,
    onKeyDown: userKeyDown, onKeyUp: userKeyUp,
    ...rest
  } = props as AllKeyProps;
  const mode = props.mode ?? 'momentary';
  const isLatch = mode === 'latch';
  const isHold = mode === 'hold';
  const btn = useRef<HTMLButtonElement>(null);
  useImperativeHandle(ref, () => btn.current!);

  const [pressed, setPressed] = useControllable(isLatch ? pressedProp : undefined, defaultPressed ?? false, onPressedChange);

  // Read through a ref so a hold that started before a re-render calls the latest callback.
  const live = useRef({ onConfirm, undoMs });
  live.current = { onConfirm, undoMs };
  const raf = useRef(0);
  const skipClick = useRef(false);
  const [undoLeft, setUndoLeft] = useState(0);
  useEffect(() => {
    if (undoLeft <= 0) return;
    const t = setTimeout(() => setUndoLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [undoLeft]);
  const doneTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => { cancelAnimationFrame(raf.current); clearTimeout(doneTimer.current); }, []);

  const setHold = (p: number) => btn.current?.style.setProperty('--hold', String(p));
  const down = () => {
    if (!isHold || disabled || raf.current || undoLeft > 0) return;
    const el = btn.current!;
    // Clear leftover drain/flash so a new hold follows the finger exactly.
    clearTimeout(doneTimer.current);
    el.classList.remove('is-draining', 'is-done');
    const dur = parseFloat(getComputedStyle(el).getPropertyValue('--mo-t-hold')) || 600;
    const t0 = performance.now();
    const frame = () => {
      const p = Math.min(1, (performance.now() - t0) / dur);
      setHold(p);
      if (p < 1) { raf.current = requestAnimationFrame(frame); return; }
      raf.current = 0;
      el.classList.add('is-done');
      doneTimer.current = setTimeout(() => {
        el.classList.remove('is-done');
        setHold(0);
      }, 240);
      skipClick.current = true; // the click that ends this hold must not trigger Undo
      live.current.onConfirm?.();
      const ms = live.current.undoMs;
      if (ms) setUndoLeft(Math.max(1, Math.round(ms / 1000)));
    };
    raf.current = requestAnimationFrame(frame);
  };
  const up = () => {
    if (!raf.current) return;
    cancelAnimationFrame(raf.current);
    raf.current = 0;
    btn.current?.classList.add('is-draining');
    setHold(0);
  };

  const activate = () => {
    if (disabled) return;
    if (skipClick.current) { skipClick.current = false; return; }
    if (undoLeft > 0) { setUndoLeft(0); onUndo?.(); return; }
    if (isLatch) setPressed(!pressed);
    else if (mode === 'momentary') onPress?.();
  };

  const text = undoLeft > 0 ? `Undo · ${undoLeft}s` : process && pressed && onLabel ? onLabel : label;
  const { ref: labelEl, shown } = useLabel(
    undoLeft > 0 ? [text, 'Undo'] : [text, label, short],
    undoLeft > 0 ? 'Undo' : label,
    icon && undoLeft <= 0 ? 'icon' : 'letter',
  );
  const helpText = useHelp(help, isHold ? (undoLeft > 0 ? 'Press to undo' : 'Press and hold to confirm') : undefined, rest['aria-describedby']);
  const labelNode = (
    <span ref={labelEl} className="mo-label" hidden={shown === null} aria-live={isHold ? 'polite' : undefined}>{shown}</span>
  );

  return (
    <button
      // Explicit, because a shortened or hidden label would otherwise change the accessible name.
      aria-label={text}
      title={shown === null && !help ? text : undefined}
      {...rest}
      ref={btn}
      type="button"
      {...cellProps({ w, h, x, y, tone, accent, scale, className, style }, 'mo-key', primary && 'mo-cell--primary', isHold && 'mo-hold')}
      data-mode={mode}
      data-role={isLatch && process ? 'process' : undefined}
      aria-pressed={isLatch ? pressed : undefined}
      disabled={disabled}
      onClick={chain(userClick, activate)}
      onPointerDown={chain(userDown, (e) => {
        if (e.button !== 0) return;
        // A hold released off the key never gets its click, so the flag would otherwise linger.
        skipClick.current = false;
        down();
      })}
      onPointerUp={chain(userUp, up)}
      onPointerLeave={chain(userLeave, up)}
      onPointerCancel={chain(userCancel, up)}
      onKeyDown={chain(userKeyDown, (e) => {
        if (isHold && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); if (!e.repeat) down(); }
      })}
      onKeyUp={chain(userKeyUp, (e) => {
        if (!isHold || (e.key !== ' ' && e.key !== 'Enter')) return;
        e.preventDefault();
        up();
        if (skipClick.current) skipClick.current = false;
        else if (undoLeft > 0) activate();
      })}
      {...helpText.props}
    >
      {icon}
      {isLatch ? (
        // Wrapped together so the latch bar follows the label wherever the cell places it.
        <span className="mo-latch">
          {labelNode}
          <span className="mo-ind" />
        </span>
      ) : labelNode}
      {helpText.node}
    </button>
  );
});
