import { forwardRef, useEffect, useRef, type HTMLAttributes, type KeyboardEvent, type Ref } from 'react';
import { cellProps, chain, useControllable, useFit, useHelp, useLabel, warnFallback, type Placement } from '../shared.js';

export interface ToggleProps extends Placement, Omit<HTMLAttributes<HTMLElement>, 'className' | 'style' | 'children'> {
  /** Label for a switch, or the group name for a pair. */
  label?: string;
  /** Two words instead of a switch, e.g. ["Auto", "Manual"]. On = first word. Renders as a radio group; use w={2}. */
  pair?: [string, string];
  /** Short forms of the pair, used for both words when either one doesn't fit. */
  short?: [string, string];
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  /** Default "On". */
  onText?: string;
  /** Default "Off". */
  offText?: string;
  help?: string;
  disabled?: boolean;
}

/** The ref is the <button> for a switch and the radiogroup <div> for a pair. */
export const Toggle = forwardRef<HTMLElement, ToggleProps>(function Toggle(
  { label, pair, short, checked, defaultChecked = false, onCheckedChange, onText = 'On', offText = 'Off', help, disabled, w, h, x, y, tone, accent, scale, className, style, onClick, onKeyDown, ...rest },
  ref,
) {
  const [on, setOn] = useControllable(checked, defaultChecked, onCheckedChange);
  const opts = useRef<(HTMLButtonElement | null)[]>([]);
  const helpText = useHelp(help, undefined, rest['aria-describedby']);
  // Both words step down together so the pair stays visually balanced; the last step (one letter) always fits.
  const words: string[][] = [];
  if (pair) {
    words.push(pair);
    if (short) words.push(short);
    const lv = (w: string) => { const f = w.trim().split(/\s+/)[0] ?? w; return [f, f.slice(0, 3), f.slice(0, 1)]; };
    for (let k = 0; k < 3; k++) {
      const next = [lv(pair[0])[k], lv(pair[1])[k]];
      if (!words.some((ws) => ws[0] === next[0] && ws[1] === next[1])) words.push(next);
    }
  }
  const authoredWords = short ? 2 : 1;
  const fit = useFit(() => opts.current, words.length, words.flat().join('|'));
  const shownWords = words[fit];
  useEffect(() => {
    if (pair && fit >= authoredWords) warnFallback(pair.join(' / '), shownWords.join(' / '));
  }, [fit]); // eslint-disable-line react-hooks/exhaustive-deps
  const { ref: labelEl, shown: shownLabel } = useLabel([label], label ?? '', 'hide');

  if (pair) {
    const onArrow = (e: KeyboardEvent<HTMLElement>) => {
      if (disabled || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
      e.preventDefault();
      setOn(!on);
      opts.current[on ? 1 : 0]?.focus();
    };
    return (
      <div
        aria-label={label}
        {...rest}
        ref={ref as Ref<HTMLDivElement>}
        role="radiogroup"
        aria-disabled={disabled || undefined}
        {...cellProps({ w: w ?? 2, h, x, y, tone, accent, scale, className, style }, 'mo-toggle', 'mo-toggle--pair')}
        onKeyDown={chain(onKeyDown, onArrow)}
        {...helpText.props}
      >
        <span className="mo-pair">
          {pair.map((word, i) => {
            const shownWord = shownWords?.[i] ?? word;
            const sel = (i === 0) === on;
            return (
              <button
                key={i}
                ref={(n) => { opts.current[i] = n; }}
                type="button"
                role="radio"
                aria-checked={sel}
                tabIndex={sel ? 0 : -1}
                disabled={disabled}
                onClick={() => setOn(i === 0)}
                aria-label={shownWord === word ? undefined : word}
              >
                {shownWord}
              </button>
            );
          })}
        </span>
        {helpText.node}
      </div>
    );
  }

  return (
    <button
      aria-label={label}
      title={shownLabel !== label && !help ? label : undefined}
      {...rest}
      ref={ref as Ref<HTMLButtonElement>}
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={chain(onClick, () => setOn(!on))}
      onKeyDown={onKeyDown}
      {...cellProps({ w: w ?? 1, h, x, y, tone, accent, scale, className, style }, 'mo-toggle')}
      {...helpText.props}
    >
      <span ref={labelEl} className="mo-label" hidden={shownLabel === null}>{shownLabel}</span>
      <div className="mo-row mo-row--end">
        <span className="mo-state" aria-hidden="true">{on ? onText : offText}</span>
        <span className="mo-slot" />
      </div>
      {helpText.node}
    </button>
  );
});
