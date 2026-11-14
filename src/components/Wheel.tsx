import { forwardRef } from 'react';
import { RangeBase, type SliderProps } from './Slider.js';

export type WheelProps = Omit<SliderProps, 'orient'>;

export const Wheel = forwardRef<HTMLDivElement, WheelProps>(function Wheel(props, ref) {
  return <RangeBase {...props} ref={ref} kind="wheel" />;
});
