import { act, fireEvent, render, screen } from '@testing-library/react';
import { Cell, Grid, Key, Readout, Slider, Stepper, Tape, Theme, Toggle, Wheel } from '../src';
import { ticks, travelDelay } from '../src/shared';

const inGrid = (ui: React.ReactNode) => render(<Grid>{ui}</Grid>);

test('cell size and placement become CSS variables', () => {
  inGrid(<Key label="Go" w={2} h={1} x={3} y={1} />);
  const b = screen.getByRole('button', { name: 'Go' });
  expect(b.className).toContain('mo-cell');
  expect(b.style.getPropertyValue('--w')).toBe('2');
  expect(b.style.getPropertyValue('--x')).toBe('3');
  expect(b.hasAttribute('data-x')).toBe(true);
});

test('momentary key fires onPress', () => {
  const onPress = vi.fn();
  inGrid(<Key label="Deploy" onPress={onPress} />);
  fireEvent.click(screen.getByRole('button'));
  expect(onPress).toHaveBeenCalledOnce();
});

test('process key latches, says what is happening and exposes aria-pressed', () => {
  inGrid(<Key mode="latch" process label="Play" onLabel="Playing" />);
  const b = screen.getByRole('button');
  expect(b).toHaveProperty('ariaPressed', 'false');
  fireEvent.click(b);
  expect(b.getAttribute('aria-pressed')).toBe('true');
  expect(b.textContent).toContain('Playing');
});

test('hold key confirms after the hold, offers Undo, and the release click does not undo', () => {
  vi.useFakeTimers();
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const rafs: FrameRequestCallback[] = [];
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => (rafs.push(cb), rafs.length));
  const onConfirm = vi.fn(), onUndo = vi.fn();
  inGrid(<Key mode="hold" label="Delete" undoMs={5000} onConfirm={onConfirm} onUndo={onUndo} />);
  const b = screen.getByRole('button');
  fireEvent.pointerDown(b);
  now = 1000;
  act(() => rafs.shift()!(now));
  expect(onConfirm).toHaveBeenCalledOnce();
  fireEvent.pointerUp(b);
  fireEvent.click(b); // the click that ends the hold
  expect(onUndo).not.toHaveBeenCalled();
  expect(b.textContent).toContain('Undo · 5s');
  fireEvent.click(b);
  expect(onUndo).toHaveBeenCalledOnce();
  vi.useRealTimers();
});

test('toggle switches and shows its state word', () => {
  const onChange = vi.fn();
  inGrid(<Toggle label="Sync" onCheckedChange={onChange} />);
  const s = screen.getByRole('switch');
  expect(s.textContent).toContain('Off');
  fireEvent.click(s);
  expect(onChange).toHaveBeenCalledWith(true);
  expect(s.getAttribute('aria-checked')).toBe('true');
  expect(s.textContent).toContain('On');
});

test('stepper is a spinbutton that stays inside its limits and keeps focus at the edge', () => {
  inGrid(<Stepper label="Lines" min={1} max={3} defaultValue={2} />);
  const sb = screen.getByRole('spinbutton', { name: 'Lines' });
  const plus = screen.getByRole('button', { name: 'Increase Lines' });
  sb.focus();
  fireEvent.mouseDown(plus);
  fireEvent.click(plus);
  fireEvent.click(plus);
  expect(sb.getAttribute('aria-valuenow')).toBe('3');
  expect(plus.getAttribute('aria-disabled')).toBe('true');
  expect(document.activeElement).toBe(sb);
  fireEvent.keyDown(sb, { key: 'ArrowDown' });
  expect(sb.getAttribute('aria-valuenow')).toBe('2');
});

test('slider keys: arrows step, Shift jumps, Home/End, Delete resets', () => {
  const onChange = vi.fn(), onCommit = vi.fn();
  inGrid(<Slider label="Vol" defaultValue={50} onValueChange={onChange} onValueCommit={onCommit} />);
  const s = screen.getByRole('slider');
  fireEvent.keyDown(s, { key: 'ArrowRight' });
  expect(s.getAttribute('aria-valuenow')).toBe('51');
  fireEvent.keyDown(s, { key: 'ArrowRight', shiftKey: true });
  expect(s.getAttribute('aria-valuenow')).toBe('61');
  fireEvent.keyDown(s, { key: 'End' });
  expect(s.getAttribute('aria-valuenow')).toBe('100');
  fireEvent.keyDown(s, { key: 'Delete' });
  expect(s.getAttribute('aria-valuenow')).toBe('50');
  expect(onCommit.mock.calls.map((c) => c[0])).toEqual([51, 61, 100, 50]); // key changes are final changes
});

test('bipolar slider fills from zero, marks zero as the reference, and prints a sign', () => {
  inGrid(<Slider label="Tracking" min={-100} max={100} defaultValue={30} unit="%" w={3} />);
  const s = screen.getByRole('slider');
  expect(s.getAttribute('aria-valuetext')).toBe('+30 %');
  const at = (el: Element | null) => (el as HTMLElement).style.getPropertyValue('--at');
  const ticks = [...s.querySelectorAll('.mo-ruler i')];
  expect(ticks).toHaveLength(41); // one every 5 from −100 to 100: the ruler is 2.5 cells of travel long
  expect(ticks.filter((t) => t.classList.contains('lit')).map(at)).toEqual(['50%', '52.5%', '55%', '57.5%', '60%', '62.5%', '65%']); // 0 … 30
  const fill = s.querySelector('.mo-fill') as HTMLElement;
  expect([fill.style.getPropertyValue('--from'), fill.style.getPropertyValue('--to')]).toEqual(['50%', '65%']);
  expect(at(s.querySelector('.mo-ref'))).toBe('50%');
});

test('a slider that starts from its min has a fill but no reference mark', () => {
  inGrid(<Slider label="Vol" defaultValue={40} />);
  const s = screen.getByRole('slider');
  expect(s.querySelector('.mo-ref')).toBeNull();
  expect((s.querySelector('.mo-fill') as HTMLElement).style.getPropertyValue('--from')).toBe('0%');
});

test('values show the step\'s decimals, a true minus, and + only on ranges that cross zero', () => {
  render(
    <>
      <Slider label="Angle" min={130} max={145} step={0.01} defaultValue={137.5} />
      <Slider label="Gain" min={-24} max={24} defaultValue={-6} unit="dB" />
      <Stepper label="Zoom" min={0.5} max={4} step={0.25} defaultValue={1} />
    </>,
  );
  expect(screen.getByRole('slider', { name: 'Angle' }).querySelector('.mo-value')!.textContent).toBe('137.50');
  expect(screen.getByRole('slider', { name: 'Gain' }).getAttribute('aria-valuetext')).toBe('−6 dB');
  expect(screen.getByRole('spinbutton').querySelector('.mo-value')!.textContent).toBe('1.00');
});

test('ruler ticks sit on round values of the range', () => {
  const values = (min: number, max: number, step: number, target: number) => ticks(min, max, step, target).map((t) => t.value);
  expect(values(130, 145, 0.01, 24)).toEqual(Array.from({ length: 16 }, (_, i) => 130 + i)); // every 1°
  expect(ticks(130, 145, 0.01, 24).filter((t) => t.major).map((t) => t.value)).toEqual([130, 135, 140, 145]);
  expect(values(0, 100, 1, 32)).toEqual(Array.from({ length: 21 }, (_, i) => i * 5)); // every 5
  expect(values(0, 10, 3, 24)).toEqual([0, 3, 6, 9]); // never finer than the step
});

/**
 * Tests of the pointer mapping turn weight off (inertia={false}) so values land at once; the weight tests run frames.
 * Give a slider real geometry (jsdom has no layout): cell 200×89, ruler 200 px wide, centre at x = 100.
 * The ruler slides: the whole range is 2.5 ruler widths, so 0..100 → 5 px per unit,
 * and dragging pulls the ruler (right lowers the value).
 */
function rig(s: HTMLElement) {
  const box = (left: number, top: number, width: number, height: number) =>
    () => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() {} }) as DOMRect;
  s.setPointerCapture = () => {};
  s.getBoundingClientRect = box(0, 0, 200, 89);
  (s.querySelector('.mo-ruler') as HTMLElement).getBoundingClientRect = box(0, 60, 200, 20);
}
const clock = () => {
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  return (ms: number) => { now += ms; };
};

test('slider: a press changes nothing, a quick click jumps, a slow press does nothing', () => {
  const tick = clock();
  const onCommit = vi.fn();
  render(<Slider label="Vol" defaultValue={50} onValueCommit={onCommit} />);
  const s = screen.getByRole('slider');
  rig(s);
  fireEvent.pointerDown(s, { button: 0, pointerId: 1, clientX: 180, clientY: 70 });
  expect(s.getAttribute('aria-valuenow')).toBe('50'); // no jump on press
  tick(500);
  fireEvent.pointerUp(s, { pointerId: 1, clientX: 180, clientY: 70 });
  expect(s.getAttribute('aria-valuenow')).toBe('50'); // a slow press is not a click
  fireEvent.pointerDown(s, { button: 0, pointerId: 2, clientX: 180, clientY: 70 });
  tick(120);
  fireEvent.pointerUp(s, { pointerId: 2, clientX: 180, clientY: 70 });
  expect(s.getAttribute('aria-valuenow')).toBe('66'); // a quick click brings the clicked tick (80 px right of centre = +16) to the thumb
  expect(onCommit.mock.calls).toEqual([[66]]);
});

test('slider: dragging is relative, the value moves as far as the pointer', () => {
  clock();
  const onCommit = vi.fn();
  render(<Slider label="Vol" inertia={false} defaultValue={50} onValueCommit={onCommit} />);
  const s = screen.getByRole('slider');
  rig(s);
  fireEvent.pointerDown(s, { button: 0, pointerId: 1, clientX: 20, clientY: 70 }); // far from the thumb (at the centre)
  fireEvent.pointerMove(s, { pointerId: 1, clientX: 40, clientY: 70 });
  expect(s.getAttribute('aria-valuenow')).toBe('46'); // the ruler moves 20 px right: 4 lower units come under the thumb
  fireEvent.pointerUp(s, { pointerId: 1, clientX: 40, clientY: 70 });
  expect(onCommit.mock.calls).toEqual([[46]]);
});

test('slider: moving away from the slider slows the drag, and the label says so', () => {
  clock();
  render(<Slider label="Vol" inertia={false} defaultValue={50} />);
  const s = screen.getByRole('slider');
  rig(s);
  fireEvent.pointerDown(s, { button: 0, pointerId: 1, clientX: 100, clientY: 70 });
  fireEvent.pointerMove(s, { pointerId: 1, clientX: 100, clientY: 139 }); // 50 px below the cell: ×¼
  fireEvent.pointerMove(s, { pointerId: 1, clientX: 140, clientY: 139 });
  expect(s.getAttribute('aria-valuenow')).toBe('48'); // 40 px ÷ 5 ÷ 4
  expect(s.querySelector('.mo-label')!.textContent).toBe('Fine ×¼ · −2'); // precision, and the change so far
  expect(s.getAttribute('aria-label')).toBe('Vol'); // the accessible name doesn't change
  fireEvent.pointerMove(s, { pointerId: 1, clientX: 140, clientY: 200 }); // 111 px away: ×1/16
  fireEvent.pointerMove(s, { pointerId: 1, clientX: 220, clientY: 200 });
  expect(s.getAttribute('aria-valuenow')).toBe('47'); // 80 px ÷ 5 ÷ 16 = 1
  vi.useFakeTimers();
  fireEvent.pointerUp(s, { pointerId: 1 });
  expect(s.querySelector('.mo-label')!.textContent).toBe('−3'); // the change stays a moment after release
  act(() => vi.advanceTimersByTime(400));
  expect(s.querySelector('.mo-label')!.textContent).toBe('Vol');
  vi.useRealTimers();
});

test('slider: on a jump, each tick lights when the travelling thumb reaches it', () => {
  render(<Slider label="Vol" defaultValue={0} w={3} />);
  const s = screen.getByRole('slider');
  fireEvent.keyDown(s, { key: 'End' }); // 0 → 100: the thumb travels the whole ruler
  const delays = [...s.querySelectorAll('.mo-ruler i')].map((t) => Number((t as HTMLElement).style.getPropertyValue('--d')));
  expect(delays[0]).toBe(0);
  expect(delays[delays.length - 1]).toBe(1);
  expect(delays.every((d, i) => i === 0 || d >= delays[i - 1])).toBe(true); // in order along the travel
  expect(travelDelay(0.5)).toBeGreaterThan(0.3); // eased, not linear: the middle is reached at the curve's time
  expect(travelDelay(0.5)).toBeLessThan(0.7);
});

test('slider: pushing past a limit hits the end stop, by drag and by key', () => {
  clock();
  render(<Slider label="Vol" inertia={false} defaultValue={95} />);
  const s = screen.getByRole('slider');
  rig(s);
  fireEvent.pointerDown(s, { button: 0, pointerId: 1, clientX: 100, clientY: 70 });
  fireEvent.pointerMove(s, { pointerId: 1, clientX: 60, clientY: 70 }); // pull the ruler left 40 px: +8, past 100
  expect(s.getAttribute('aria-valuenow')).toBe('100');
  expect(s.classList.contains('is-stop')).toBe(true);
  expect(s.dataset.stop).toBe('max');
  fireEvent.pointerUp(s, { pointerId: 1 });
  s.classList.remove('is-stop');
  fireEvent.keyDown(s, { key: 'ArrowRight' }); // already at max
  expect(s.classList.contains('is-stop')).toBe(true);
});

test('slider: pointer focus shows no ring until a key is pressed', () => {
  clock();
  render(<Slider label="Vol" defaultValue={50} />);
  const s = screen.getByRole('slider');
  rig(s);
  fireEvent.pointerDown(s, { button: 0, pointerId: 1, clientX: 100, clientY: 70 });
  expect(document.activeElement).toBe(s); // focused, so its keys work
  expect(s.hasAttribute('data-pointer')).toBe(true); // but marked, so CSS draws no ring
  fireEvent.keyDown(s, { key: 'ArrowRight' });
  expect(s.hasAttribute('data-pointer')).toBe(false);
});

test('slider: on touch, a swipe across the slider is left to the page, a swipe along it drags', () => {
  clock();
  render(<Slider label="Vol" inertia={false} defaultValue={50} />);
  const s = screen.getByRole('slider');
  rig(s);
  fireEvent.pointerDown(s, { button: 0, pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 70 });
  fireEvent.pointerMove(s, { pointerId: 1, pointerType: 'touch', clientX: 105, clientY: 70 }); // inside the 8 px slop
  expect(s.getAttribute('aria-valuenow')).toBe('50');
  fireEvent.pointerMove(s, { pointerId: 1, pointerType: 'touch', clientX: 104, clientY: 90 }); // mostly vertical: a scroll
  fireEvent.pointerMove(s, { pointerId: 1, pointerType: 'touch', clientX: 160, clientY: 90 });
  expect(s.getAttribute('aria-valuenow')).toBe('50'); // abandoned, never grabbed
  fireEvent.pointerDown(s, { button: 0, pointerId: 2, pointerType: 'touch', clientX: 100, clientY: 70 });
  fireEvent.pointerMove(s, { pointerId: 2, pointerType: 'touch', clientX: 120, clientY: 72 }); // along the axis
  expect(s.getAttribute('aria-valuenow')).toBe('46');
});

test('slider wheel: trackpad travel follows the fingers, a mouse notch is one step, a gesture commits once', () => {
  vi.useFakeTimers();
  const tick = clock();
  const onCommit = vi.fn();
  render(<Slider label="Vol" defaultValue={50} onValueCommit={onCommit} />);
  const s = screen.getByRole('slider');
  rig(s);
  s.focus();
  for (let i = 0; i < 4; i++) { fireEvent.wheel(s, { deltaX: 5 }); tick(16); } // a trackpad swipe: 20 px
  expect(s.getAttribute('aria-valuenow')).toBe('54'); // the ruler travels 20 px at 5 px per unit, not 4 steps
  expect(onCommit).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(200));
  expect(onCommit.mock.calls).toEqual([[54]]); // once, when the gesture ends
  tick(300);
  fireEvent.wheel(s, { deltaY: -100 }); // a mouse-wheel notch
  expect(s.getAttribute('aria-valuenow')).toBe('55');
  vi.useRealTimers();
});

test('tape: the slider engine with a bare look; the scale slides under a centred bar', () => {
  clock();
  render(<Tape label="Zoom" inertia={false} defaultValue={50} />);
  const s = screen.getByRole('slider', { name: 'Zoom' });
  rig(s);
  expect(s.className).toContain('mo-tape');
  expect(s.dataset.motion).toBe('slide');
  expect((s.querySelector('.mo-strip') as HTMLElement).style.getPropertyValue('--pv')).toBe('0.5');
  fireEvent.pointerDown(s, { button: 0, pointerId: 1, clientX: 100, clientY: 70 });
  fireEvent.pointerMove(s, { pointerId: 1, clientX: 80, clientY: 70 }); // pull the tape left
  expect(s.getAttribute('aria-valuenow')).toBe('54');
});

test('wheel: ticks on a turning drum, always horizontal; a click turns the clicked tick to the needle', () => {
  const tick = clock();
  render(<Wheel label="Hue" min={0} max={360} defaultValue={180} w={1} h={3} />);
  const s = screen.getByRole('slider', { name: 'Hue' });
  rig(s);
  const drum = s.querySelector('.mo-drum') as HTMLElement;
  Object.defineProperty(drum, 'offsetWidth', { value: 800 }); // marks at radius 400 × 0.99 = 396 px
  expect(s.className).toContain('mo-wheel');
  expect(s.dataset.motion).toBe('turn');
  expect(s.getAttribute('aria-orientation')).toBe('horizontal'); // even when taller than wide
  expect(drum.style.getPropertyValue('--turn')).toBe('-30deg'); // 180 of 360 across a 60° sweep
  fireEvent.pointerDown(s, { button: 0, pointerId: 1, clientX: 100 + 198, clientY: 70 });
  tick(100);
  fireEvent.pointerUp(s, { pointerId: 1, clientX: 100 + 198, clientY: 70 }); // 198 / 396 = sin 30°: 30° along the drum
  expect(s.getAttribute('aria-valuenow')).toBe('360'); // 30° × 6 units per degree = +180
});

/** A fling: drag the ruler 40 px left over 40 ms (1 px/ms = 0.2 units/ms at 5 px per unit), then let go. */
function fling(s: HTMLElement, tick: (ms: number) => void) {
  fireEvent.pointerDown(s, { button: 0, pointerId: 1, clientX: 140, clientY: 70 });
  for (let x = 130; x >= 100; x -= 10) { tick(10); fireEvent.pointerMove(s, { pointerId: 1, clientX: x, clientY: 70 }); }
  fireEvent.pointerUp(s, { pointerId: 1, clientX: 100, clientY: 70 });
}
const frames = () => {
  const queue: FrameRequestCallback[] = [];
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => (queue.push(cb), queue.length));
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  /** Run frames at the given times (ms) until the queue empties. */
  return (...times: number[]) => { for (const t of times) { const cb = queue.shift(); if (!cb) return; act(() => cb(t)); } };
};

/** Frames every 16 ms from `from`, `count` of them. */
const every16 = (from: number, count: number) => Array.from({ length: count }, (_, i) => from + i * 16);

test('weight: while dragging, the scale trails the hand and catches up; a slow release lands where it was left', () => {
  const tick = clock();
  const run = frames();
  const onCommit = vi.fn();
  render(<Slider label="Vol" defaultValue={50} onValueCommit={onCommit} />);
  const s = screen.getByRole('slider');
  rig(s);
  fireEvent.pointerDown(s, { button: 0, pointerId: 1, clientX: 140, clientY: 70 });
  tick(10);
  fireEvent.pointerMove(s, { pointerId: 1, clientX: 100, clientY: 70 }); // the hand puts 58 under the thumb
  expect(s.getAttribute('aria-valuenow')).toBe('50'); // the scale hasn't moved yet
  run(0);
  expect(s.getAttribute('aria-valuenow')).toBe('51'); // first frame: 16 ms of a 90 ms catch-up
  run(...every16(16, 40));
  expect(s.getAttribute('aria-valuenow')).toBe('58'); // caught up
  tick(200);
  fireEvent.pointerUp(s, { pointerId: 1 }); // held still: no coast
  expect(onCommit.mock.calls).toEqual([[58]]);
});

test('weight: a fast release coasts on, slows, and commits once at rest', () => {
  const tick = clock();
  const run = frames();
  const onCommit = vi.fn();
  render(<Slider label="Vol" defaultValue={50} onValueCommit={onCommit} />);
  const s = screen.getByRole('slider');
  rig(s);
  fling(s, tick);
  run(0, 100, 200);
  const mid = Number(s.getAttribute('aria-valuenow'));
  expect(mid).toBeGreaterThan(58); // past where the hand let go
  expect(onCommit).not.toHaveBeenCalled(); // still moving
  run(5000);
  expect(s.getAttribute('aria-valuenow')).toBe('100'); // 8 + 65 more to travel: it reaches the end and hits the stop
  expect(s.classList.contains('is-stop')).toBe(true);
  expect(onCommit.mock.calls).toEqual([[100]]);
});

test('weight: a press catches the coast where it is, and is not a click', () => {
  const tick = clock();
  const run = frames();
  const onCommit = vi.fn();
  render(<Slider label="Vol" defaultValue={10} onValueCommit={onCommit} />);
  const s = screen.getByRole('slider');
  rig(s);
  fling(s, tick);
  run(0, 100, 200);
  const caught = s.getAttribute('aria-valuenow');
  fireEvent.pointerDown(s, { button: 0, pointerId: 2, clientX: 180, clientY: 70 });
  tick(50);
  fireEvent.pointerUp(s, { pointerId: 2, clientX: 180, clientY: 70 }); // quick, but it caught the coast: no jump
  run(300, 400);
  expect(s.getAttribute('aria-valuenow')).toBe(caught);
  expect(onCommit.mock.calls).toEqual([[Number(caught)]]);
});

test('weight: inertia={false} follows the hand exactly and never coasts', () => {
  const tick = clock();
  frames();
  const onCommit = vi.fn();
  render(<Tape label="C" inertia={false} defaultValue={50} onValueCommit={onCommit} />);
  const c = screen.getByRole('slider');
  rig(c);
  fling(c, tick);
  expect(c.getAttribute('aria-valuenow')).toBe('58'); // no lag
  expect(onCommit.mock.calls).toEqual([[58]]); // commits at release
  expect(window.requestAnimationFrame).not.toHaveBeenCalled();
});

const rolled = (root: Element) =>
  [...root.querySelectorAll('.mo-digit[data-roll]')].map((d) => `${d.textContent}:${d.getAttribute('data-roll')}:${d.firstElementChild!.getAttribute('data-from')}`);

test('digits roll on a discrete change: only the changed ones, up when the value grew', () => {
  render(<Stepper label="Lines" min={0} max={100} defaultValue={12} />);
  const sb = screen.getByRole('spinbutton');
  fireEvent.click(screen.getByRole('button', { name: 'Increase Lines' }));
  expect(rolled(sb)).toEqual(['3:up:2']); // 12 → 13: the 1 stays put
  fireEvent.keyDown(sb, { key: 'Home' });
  expect(rolled(sb)).toEqual(['0:down:3']); // 13 → 0, compared from the right; the 1 just leaves
  fireEvent.keyDown(sb, { key: 'End' });
  expect(rolled(sb)).toEqual(['1:up:', '0:up:']); // 0 → 100: two digits arrive from blank, the last 0 stays
  expect(sb.querySelector('.mo-value')!.textContent).toBe('100'); // the old characters are CSS only
});

test('slider digits roll on keys and clicks, never while dragging', () => {
  const tick = clock();
  render(<Slider label="Vol" inertia={false} defaultValue={50} />);
  const s = screen.getByRole('slider');
  rig(s);
  fireEvent.keyDown(s, { key: 'ArrowRight' });
  expect(rolled(s)).toEqual(['1:up:0']);
  fireEvent.pointerDown(s, { button: 0, pointerId: 1, clientX: 100, clientY: 70 });
  fireEvent.pointerMove(s, { pointerId: 1, clientX: 120, clientY: 70 });
  expect(s.getAttribute('aria-valuenow')).toBe('47');
  expect(rolled(s)).toEqual([]); // dragging: digits change in place
  fireEvent.pointerUp(s, { pointerId: 1 });
  tick(300);
});

test('slider: a hovering mouse previews where a click would land', () => {
  clock();
  render(<Slider label="Vol" unit="%" defaultValue={50} />);
  const s = screen.getByRole('slider');
  rig(s);
  fireEvent.pointerMove(s, { pointerType: 'mouse', buttons: 0, clientX: 180, clientY: 70 });
  expect((s.querySelector('.mo-ghost') as HTMLElement).style.getPropertyValue('--pos')).toBe('66%'); // on the ruler, under the pointer
  expect(s.querySelector('.mo-label')!.textContent).toBe('→ 66 %');
  fireEvent.pointerMove(s, { pointerType: 'touch', buttons: 0, clientX: 40, clientY: 70 }); // touch has no hover
  expect((s.querySelector('.mo-ghost') as HTMLElement).style.getPropertyValue('--pos')).toBe('66%');
  fireEvent.pointerLeave(s);
  expect(s.querySelector('.mo-ghost')).toBeNull();
  expect(s.querySelector('.mo-label')!.textContent).toBe('Vol');
});

test('hold key: an early release drains the fill, a completed hold flashes it', () => {
  vi.useFakeTimers();
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const rafs: FrameRequestCallback[] = [];
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => (rafs.push(cb), rafs.length));
  render(<Key mode="hold" label="Delete" onConfirm={() => {}} />);
  const b = screen.getByRole('button');
  fireEvent.pointerDown(b, { button: 0 });
  now = 300;
  act(() => rafs.shift()!(now)); // half way
  expect(b.style.getPropertyValue('--hold')).toBe('0.5');
  fireEvent.pointerUp(b);
  expect(b.classList.contains('is-draining')).toBe(true); // CSS animates --hold back to 0
  expect(b.style.getPropertyValue('--hold')).toBe('0');
  fireEvent.pointerDown(b, { button: 0 });
  expect(b.classList.contains('is-draining')).toBe(false); // a new hold follows the finger exactly
  now = 1000;
  act(() => rafs[rafs.length - 1](now));
  expect(b.classList.contains('is-done')).toBe(true);
  expect(b.style.getPropertyValue('--hold')).toBe('1'); // full fill while it flashes
  act(() => vi.advanceTimersByTime(240));
  expect(b.classList.contains('is-done')).toBe(false);
  expect(b.style.getPropertyValue('--hold')).toBe('0');
  vi.useRealTimers();
});

test('stepper: press and hold repeats, release stops', () => {
  vi.useFakeTimers();
  render(<Stepper label="Lines" min={0} max={100} defaultValue={10} />);
  const sb = screen.getByRole('spinbutton');
  const plus = screen.getByRole('button', { name: 'Increase Lines' });
  fireEvent.pointerDown(plus, { button: 0 });
  expect(sb.getAttribute('aria-valuenow')).toBe('11'); // one step at once
  act(() => vi.advanceTimersByTime(400 + 60 * 3));
  expect(sb.getAttribute('aria-valuenow')).toBe('15'); // then repeats
  fireEvent.pointerUp(plus);
  fireEvent.click(plus); // the click that ends a pointer press does not step again
  act(() => vi.advanceTimersByTime(1000));
  expect(sb.getAttribute('aria-valuenow')).toBe('15');
  vi.useRealTimers();
});

test('wheel changes the value only while focused', () => {
  inGrid(<Slider label="Vol" defaultValue={50} />);
  const s = screen.getByRole('slider');
  fireEvent.wheel(s, { deltaY: -100 });
  expect(s.getAttribute('aria-valuenow')).toBe('50');
  s.focus();
  fireEvent.wheel(s, { deltaY: -100 });
  expect(s.getAttribute('aria-valuenow')).toBe('51');
});

test('hold key: releasing off the key after confirming does not swallow the Undo click', () => {
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const rafs: FrameRequestCallback[] = [];
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => (rafs.push(cb), rafs.length));
  const onUndo = vi.fn();
  inGrid(<Key mode="hold" label="Delete" undoMs={5000} onConfirm={() => {}} onUndo={onUndo} />);
  const b = screen.getByRole('button');
  fireEvent.pointerDown(b);
  now = 1000;
  act(() => rafs.shift()!(now));
  fireEvent.pointerLeave(b); // released elsewhere: no click reaches the key
  fireEvent.pointerDown(b);
  fireEvent.pointerUp(b);
  fireEvent.click(b);
  expect(onUndo).toHaveBeenCalledOnce();
});

test('slider: a cancelled pointer ends the drag, so hovering no longer moves the value', () => {
  inGrid(<Slider label="Vol" defaultValue={50} />);
  const s = screen.getByRole('slider');
  s.setPointerCapture = () => {};
  fireEvent.pointerDown(s, { button: 0, shiftKey: true, clientX: 0, pointerId: 1 });
  fireEvent.lostPointerCapture(s, { pointerId: 1 });
  fireEvent.pointerMove(s, { clientX: 120 });
  expect(s.getAttribute('aria-valuenow')).toBe('50');
});

test('pair toggle is a radio group with a stable name', () => {
  const onChange = vi.fn();
  inGrid(<Toggle pair={['Auto', 'Manual']} label="Mode" defaultChecked onCheckedChange={onChange} />);
  expect(screen.getByRole('radiogroup', { name: 'Mode' })).toBeTruthy();
  const manual = screen.getByRole('radio', { name: 'Manual' });
  expect(manual.getAttribute('aria-checked')).toBe('false');
  fireEvent.keyDown(screen.getByRole('radio', { name: 'Auto' }), { key: 'ArrowRight' });
  expect(onChange).toHaveBeenCalledWith(false);
  expect(manual.getAttribute('aria-checked')).toBe('true');
  expect(document.activeElement).toBe(manual);
});

test('extra props reach the element and user handlers run alongside ours', () => {
  const onClick = vi.fn(), onPress = vi.fn();
  inGrid(<Key label="Go" id="go" data-testid="go-key" aria-keyshortcuts="G" onClick={onClick} onPress={onPress} />);
  const b = screen.getByTestId('go-key');
  expect(b.id).toBe('go');
  expect(b.getAttribute('aria-keyshortcuts')).toBe('G');
  fireEvent.click(b);
  expect(onClick).toHaveBeenCalledOnce();
  expect(onPress).toHaveBeenCalledOnce();
});

test('help text is a tooltip plus an aria-describedby description, keeping the user\'s own describedby', () => {
  render(
    <>
      <p id="note">Applies to all layers</p>
      <Slider label="Vol" help="Master output level" aria-describedby="note" />
      <Key mode="hold" label="Delete" onConfirm={() => {}} />
    </>,
  );
  const s = screen.getByRole('slider');
  expect(s.getAttribute('title')).toBe('Master output level');
  expect(s.hasAttribute('aria-description')).toBe(false);
  const ids = s.getAttribute('aria-describedby')!.split(' ');
  expect(ids[0]).toBe('note');
  expect(ids.map((id) => document.getElementById(id)!.textContent)).toEqual(['Applies to all layers', 'Master output level']);
  const key = screen.getByRole('button', { name: 'Delete' }); // the hidden description stays out of the name
  expect(document.getElementById(key.getAttribute('aria-describedby')!)!.textContent).toBe('Press and hold to confirm');
});

test('stepper commits each change, and not when a limit blocks it', () => {
  const onCommit = vi.fn();
  render(<Stepper label="Lines" min={1} max={3} defaultValue={2} onValueCommit={onCommit} />);
  const sb = screen.getByRole('spinbutton');
  fireEvent.click(screen.getByRole('button', { name: 'Increase Lines' }));
  fireEvent.keyDown(sb, { key: 'ArrowUp' }); // already at max
  fireEvent.keyDown(sb, { key: 'Home' });
  expect(onCommit.mock.calls.map((c) => c[0])).toEqual([3, 1]);
});

test('controls work without a Grid: scale becomes data-scale, never a stray attribute', () => {
  render(
    <div>
      <Key label="Go" scale="s" w={2} />
      <Slider label="Vol" />
    </div>,
  );
  const key = screen.getByRole('button', { name: 'Go' });
  expect(key.getAttribute('data-scale')).toBe('s');
  expect(key.hasAttribute('scale')).toBe(false);
  expect(key.style.getPropertyValue('--w')).toBe('2');
  expect(screen.getByRole('slider').hasAttribute('data-scale')).toBe(false); // inherits, or falls back to m in CSS
});

test('theme: appearance, accent, marks, radius and tokens become attributes and --mo- variables', () => {
  render(
    <Theme data-testid="t" appearance="auto" accent="blue" marks="accent" radius="m" tokens={{ ground: '#000', 'font-sans': 'Inter' }}>
      <Theme data-testid="inner" accent="oklch(0.7 0.15 30)" radius={0.2} />
    </Theme>,
  );
  const t = screen.getByTestId('t');
  expect(t.className).toBe('mo');
  expect([t.dataset.theme, t.dataset.accent, t.dataset.marks]).toEqual(['auto', 'blue', 'accent']);
  expect(t.style.getPropertyValue('--mo-accent-base')).toBe('#4589ff');
  expect(t.style.getPropertyValue('--mo-round')).toBe('0.1');
  expect(t.style.getPropertyValue('--mo-ground')).toBe('#000');
  expect(t.style.fontFamily).toBe('Inter'); // no font of its own: font-sans just sets the region's font-family
  const inner = screen.getByTestId('inner');
  expect(inner.dataset.accent).toBe('custom'); // any CSS colour
  expect(inner.style.getPropertyValue('--mo-accent-base')).toBe('oklch(0.7 0.15 30)');
  expect(inner.style.getPropertyValue('--mo-round')).toBe('0.2');
  expect(inner.hasAttribute('data-theme')).toBe(false); // unset options inherit
});

test('a control\'s own accent colours its marks, and is not passed on as an HTML attribute', () => {
  render(<Toggle label="Snap" accent="green" />);
  const s = screen.getByRole('switch');
  expect(s.dataset.accent).toBe('green');
  expect(s.dataset.marks).toBe('accent');
  expect(s.style.getPropertyValue('--mo-accent-base')).toBe('#24a148');
  expect(s.hasAttribute('accent')).toBe(false);
});

/** Fake layout: every label element is 30px wide and its text needs 7px per character. */
function fakeWidths() {
  const sw = vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (this: HTMLElement) { return (this.textContent ?? '').length * 7; });
  const cw = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => 30);
  return () => { sw.mockRestore(); cw.mockRestore(); };
}

test('key labels never truncate: onLabel falls back to label, then short, then the icon alone', () => {
  const restore = fakeWidths();
  const icon = <svg className="mo-glyph" />;
  inGrid(
    <>
      <Key label="Play" onLabel="Playing" mode="latch" process defaultPressed />
      <Key label="Save" short="Sv" />
      <Key label="Settings" short="Settings" icon={icon} />
      <Key label="Go" short="G" />
    </>,
  );
  // "Playing" (49px) doesn't fit 30px; "Play" (28px) does. The name stays what the key means right now.
  const play = screen.getByRole('button', { name: 'Playing' });
  expect(play.querySelector('.mo-label')!.textContent).toBe('Play');
  // "Save" fits, so the short form is not used.
  expect(screen.getByRole('button', { name: 'Save' }).querySelector('.mo-label')!.textContent).toBe('Save');
  // Nothing fits: icon only, label as tooltip.
  const settings = screen.getByRole('button', { name: 'Settings' });
  expect(settings.querySelector('.mo-label')!.hasAttribute('hidden')).toBe(true);
  expect(settings.getAttribute('title')).toBe('Settings');
  restore();
});

test('pair words switch to their short forms together when either one does not fit', () => {
  const restore = fakeWidths();
  inGrid(<Toggle pair={['Auto', 'Manual']} short={['Au', 'Man']} label="Mode" />);
  const radios = screen.getAllByRole('radio');
  expect(radios.map((r) => r.textContent)).toEqual(['Au', 'Man']);
  expect(radios.map((r) => r.getAttribute('aria-label'))).toEqual(['Auto', 'Manual']);
  restore();
});

test('wide cells are marked so dense scales can lay them out in a row', () => {
  inGrid(<><Key label="A" w={2} /><Key label="B" /></>);
  expect(screen.getByRole('button', { name: 'A' }).hasAttribute('data-wide')).toBe(true);
  expect(screen.getByRole('button', { name: 'B' }).hasAttribute('data-wide')).toBe(false);
});

test('grid cols="auto" marks the grid for reflow and leaves --cols to the fit', () => {
  const { container } = render(<Grid cols="auto" scale="s"><Key label="A" /></Grid>);
  const g = container.querySelector('.mo-grid') as HTMLElement;
  expect(g.hasAttribute('data-auto')).toBe(true);
  // jsdom has no layout, so the fit reads a 0px container and falls back to one column.
  expect(g.style.getPropertyValue('--cols')).toBe('1');
  const fixed = render(<Grid cols={6}><Key label="B" /></Grid>).container.querySelector('.mo-grid') as HTMLElement;
  expect(fixed.hasAttribute('data-auto')).toBe(false);
  expect(fixed.style.getPropertyValue('--cols')).toBe('6');
});

test('text is never cut off: with nothing authored that fits, labels fall back to generated forms and warn in dev', () => {
  const restore = fakeWidths();
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  inGrid(
    <>
      <Key label="Settings" />
      <Toggle pair={['Automatic', 'Manual']} label="Mode" />
      <Stepper label="Temperature" min={0} max={9} defaultValue={5} />
    </>,
  );
  // "Settings" (56px) → "Set" (21px) fits 30px. Name unchanged.
  expect(screen.getByRole('button', { name: 'Settings' }).querySelector('.mo-label')!.textContent).toBe('Set');
  // Both pair words step down together.
  expect(screen.getAllByRole('radio').map((r) => r.textContent)).toEqual(['Aut', 'Man']);
  // A stepper's label shortens before it would hide.
  expect(screen.getByRole('spinbutton').querySelector('.mo-label')!.textContent).toBe('Tem');
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('"Settings" doesn\'t fit its cell and is shown as "Set"'));
  warn.mockRestore();
  restore();
});

test('values are never cut off: they drop the unit, then step their size down', () => {
  const restore = fakeWidths();
  const { container } = inGrid(<Cell><Readout label="T" value={120} unit="bpm" /></Cell>);
  const value = container.querySelector('.mo-value') as HTMLElement;
  // "120bpm" can never measure under 30px in the fake layout, so it goes to the last level.
  expect(value.getAttribute('data-fit')).toBe('4');
  restore();
});

test('a large value is written compactly before it shrinks', () => {
  const restore = fakeWidths();
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const { container } = inGrid(<Cell><Readout label="F" value={14400} /></Cell>);
  // 14400 → "14.4K"; the fake layout never fits, so it ends at the last level, still compact, and warns.
  expect(container.querySelector('.mo-value')!.textContent).toBe('14.4K');
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('the value "14400" doesn\'t fit'));
  warn.mockRestore();
  restore();
});
