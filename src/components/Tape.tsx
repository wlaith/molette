import { forwardRef } from 'react';
import { RangeBase, type SliderProps } from './Slider.js';

export type TapeProps = SliderProps;

export const Tape = forwardRef<HTMLDivElement, TapeProps>(function Tape(props, ref) {
  return <RangeBase {...props} ref={ref} kind="tape" />;
});
