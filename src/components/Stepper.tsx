import { forwardRef, useEffect, useImperativeHandle, useRef, type HTMLAttributes } from 'react';
import { cellProps, chain, rangeKey, show, snap, useControllable, useHelp, useLabel, useValueFit, type Placement } from '../shared.js';
import { Digits, type Roll } from './Digits.js';

export interface StepperProps extends Placement, Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'style' | 'children' | 'defaultValue'> {
  label: string;
  value?: number;
  defaultValue?: number;
  onValueChange?: (value: number) => void;
  /** Every Stepper change is final, so this fires alongside onValueChange. Exists to match Slider's API. */
  onValueCommit?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  help?: string;
  disabled?: boolean;
}

// The cell is the focusable spinbutton and the −/+ buttons never take focus, so hitting a limit (which disables
// a button) never drops focus.
export const Stepper = forwardRef<HTMLDivElement, StepperProps>(function Stepper(
  { label, value, defaultValue, onValueChange, onValueCommit, min = 0, max = 100, step = 1, unit, help, disabled, w = 2, h, x, y, tone, accent, scale, className, style, onKeyDown, ...rest },
  ref,
) {
  const el = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => el.current!);
  const def = defaultValue ?? min;
  const [v, setRaw] = useControllable(value, def, onValueChange);
  // Updated on every set, so hold-to-repeat never steps from a stale render.
  const latest = useRef(v);
  latest.current = v;
  const rollNext = useRef<Roll>(null);
  const roll = rollNext.current;
  useEffect(() => { rollNext.current = null; });
  const setV = (n: number) => {
    if (n === latest.current) return;
    rollNext.current = n > latest.current ? 'up' : 'down';
    latest.current = n;
    setRaw(n);
    onValueCommit?.(n);
  };
  const go = (d: number) => !disabled && setV(snap(latest.current + d * step, min, max, step));
  const helpText = useHelp(help, undefined, rest['aria-describedby']);
  const text = show(v, step, min, max);

  const live = useRef(go);
  live.current = go;
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const byPointer = useRef(false);
  const stop = () => clearTimeout(timer.current);
  useEffect(() => stop, []);

  const btn = (d: 1 | -1) => {
    const off = disabled || (d > 0 ? v >= max : v <= min);
    return (
      <button
        type="button"
        tabIndex={-1}
        aria-label={`${d > 0 ? 'Increase' : 'Decrease'} ${label}`}
        aria-disabled={off || undefined}
        onMouseDown={(e) => {
          e.preventDefault();
          el.current?.setAttribute('data-pointer', ''); // pointer focus: no ring until a key is pressed
          el.current?.focus();
        }}
        onPointerDown={(e) => {
          if (off || e.button !== 0) return;
          byPointer.current = true;
          go(d);
          stop();
          timer.current = setTimeout(function repeat() {
            live.current(d);
            timer.current = setTimeout(repeat, 60);
          }, 400);
        }}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        // Pointers already stepped on pointerdown; this handles clicks with no pointer (screen readers, scripts).
        onClick={() => {
          if (byPointer.current) { byPointer.current = false; return; }
          if (!off) go(d);
        }}
      >
        <span>{d > 0 ? '+' : '−'}</span>
      </button>
    );
  };

  const { ref: labelEl, shown: shownLabel } = useLabel([label], label, 'hide');
  const valueFit = useValueFit(text + (unit ?? ''), v);

  return (
    <div
      title={shownLabel !== label && !help ? label : undefined}
      {...rest}
      ref={el}
      role="spinbutton"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={v}
      aria-valuetext={`${text}${unit ? ' ' + unit : ''}`}
      aria-disabled={disabled || undefined}
      {...cellProps({ w, h, x, y, tone, accent, scale, className, style }, 'mo-stepper')}
      onKeyDown={chain(onKeyDown, (e) => {
        e.currentTarget.removeAttribute('data-pointer');
        if (!disabled) rangeKey(e, { value: v, min, max, step, def }, setV);
      })}
      onBlur={chain(rest.onBlur, (e) => e.currentTarget.removeAttribute('data-pointer'))}
      {...helpText.props}
    >
      <div className="mo-stepper__read">
        <span ref={labelEl} className="mo-label" hidden={shownLabel === null}>{shownLabel}</span>
        <span className="mo-value" {...valueFit.props}>
          <Digits text={valueFit.compact ?? text} roll={roll} />
          {unit && <span className="mo-unit">{unit}</span>}
        </span>
      </div>
      <div className="mo-stepper__btns">
        {btn(1)}
        {btn(-1)}
      </div>
      {helpText.node}
    </div>
  );
});
