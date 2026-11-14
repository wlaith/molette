/**
 * Field: bands, seams, warp, swell, grain and hairlines, as a pure function of its params and time, drawn on a
 * plain canvas (no p5).
 */

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Palette {
  name: string;
  ground: string;
  panel: string;
  ink: string;
  ramp: string[];
  hi?: string;
  appearance?: 'light' | 'dark';
}

export const PALETTES: Palette[] = [
  { name: 'Citrus', ground: '#0b2616', panel: '#103320', ink: '#c2efb4', ramp: ['#020703', '#0b3312', '#2f6d10', '#9fb30d', '#ffe100'] },
  { name: 'Ember', ground: '#2a0d07', panel: '#3a140b', ink: '#f8d9c6', ramp: ['#070201', '#440d05', '#a22c0b', '#ef7417', '#ffd63d'] },
  { name: 'Tide', ground: '#071a2e', panel: '#0c2640', ink: '#cfe4f6', ramp: ['#01050b', '#0a2950', '#1b5ea8', '#55b6da', '#eaf8ff'] },
  { name: 'White', ground: '#f4f4f4', panel: '#ffffff', ink: '#161616', hi: '#161616', appearance: 'light',
    ramp: ['#161616', '#525252', '#a8a8a8', '#e0e0e0', '#ffffff'] },
  { name: 'Black', ground: '#000000', panel: '#161616', ink: '#f4f4f4', hi: '#ffffff',
    ramp: ['#000000', '#0e0e0e', '#2e2e2e', '#7a7a7a', '#f4f4f4'] },
];

/** Board colours from the palette, exactly as the sketch's board takes them. */
export function boardTokens(i: number) {
  const p = PALETTES[i];
  const hi = p.hi ?? p.ramp[4];
  const mix = (a: string, b: string, pct: number) => `color-mix(in srgb, ${a} ${pct}%, ${b})`;
  return {
    ground: p.ground,
    cell: p.panel,
    'cell-hover': mix(p.panel, p.ink, 88),
    'cell-sunk': mix(p.panel, p.ink, 80),
    'cell-tint': mix(p.ground, p.panel, 45),
    line: mix(p.panel, p.ink, 72),
    ink: p.ink,
    'ink-2': mix(p.ink, p.panel, 62),
    value: p.ink,
    'mark-off': mix(p.ink, p.panel, 38),
    'cell-inverse': p.ink,
    'on-inverse': p.ground,
    'on-inverse-2': mix(p.ground, p.ink, 62),
    accent: hi,
    'on-accent': p.ground,
    'accent-text': hi,
    select: mix(hi, p.panel, 18),
    'on-select': hi,
    'select-edge': hi,
    active: hi,
    'on-active': p.ground,
    focus: hi,
  };
}

export interface FieldParams {
  palette: number;
  rows: number;
  seams: number;
  flow: number;
  warp: number;
  swell: number;
  depth: number;
  width: number;
  grain: number;
  lines: number;
  steps: number;
  mirror: boolean;
  invert: boolean;
  /** A scripted pointer for the Lens, 0..1 across and down, or null. */
  lens: { x: number; y: number } | null;
}

export interface FieldSample {
  /** Per band: field values across it (STOPS + 1 smooth samples, or one per step). */
  bands: number[][];
  luma: number;
  peak: number;
  trough: number;
}

const STOPS = 64;
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const ramps = PALETTES.map((p) => p.ramp.map(hex));
const ease = (e: number) => e * e * (3 - 2 * e);

function shade(ramp: number[][], v: number) {
  const f = Math.min(0.9999, Math.max(0, v)) * (ramp.length - 1);
  const i = Math.floor(f);
  const t = ease(f - i);
  const a = ramp[i], b = ramp[i + 1];
  return `rgb(${(a[0] + (b[0] - a[0]) * t) | 0},${(a[1] + (b[1] - a[1]) * t) | 0},${(a[2] + (b[2] - a[2]) * t) | 0})`;
}

/** The field's values at time t (seconds) with seams travelled `drift` (wraps at 1). Pure. */
export function sampleField(k: FieldParams, t: number, drift: number): FieldSample {
  const rows = Math.round(k.rows);
  const seams = Math.round(k.seams);
  const width = 0.015 + (k.width / 100) * 0.15;
  const lens = k.lens;
  const bands: number[][] = [];
  let sum = 0, peak = 0, trough = 1;

  for (let i = 0; i < rows; i++) {
    const c = (i + 0.5) / rows;
    const dip = k.mirror ? Math.exp(-(((c - 0.5) / 0.3) ** 2)) : c;
    const base = 1 - (k.depth / 100) * dip * 0.97;
    const pull = lens ? Math.exp(-(((c - lens.y) / 0.3) ** 2)) : 0;
    const at = (x: number) => {
      let dark = 0;
      for (let j = 0; j < seams; j++) {
        const lean = (k.warp / 100) * 0.07 * Math.sin(i * 0.85 + t * 1.1 + j * 2.4);
        const pos = (j + 0.5) / seams + drift + lean;
        let d = (((x - pos) % 1) + 1) % 1;
        d = Math.min(d, 1 - d);
        dark = Math.max(dark, Math.exp(-((d / width) ** 2)));
      }
      if (lens) dark = Math.max(dark, pull * Math.exp(-(((x - lens.x) / (width * 1.3)) ** 2)));
      if (k.invert) dark = 1 - dark;
      const swell = (k.swell / 100) * 0.12 * Math.sin(x * 9 + i * 1.7 + t * 0.6);
      return Math.min(1, Math.max(0, base * (1 - 0.82 * dark + swell)));
    };
    const n = k.steps > 0 ? Math.round(k.steps) : STOPS + 1;
    const vals: number[] = [];
    for (let q = 0; q < n; q++) vals.push(at(k.steps > 0 ? (q + 0.5) / n : q / STOPS));
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    bands.push(vals);
    sum += mean;
    peak = Math.max(peak, mean);
    trough = Math.min(trough, mean);
  }
  return { bands, luma: sum / rows, peak, trough };
}

let tile: HTMLCanvasElement | null = null;
function grainTile() {
  if (tile) return tile;
  const rand = mulberry32(7);
  tile = document.createElement('canvas');
  tile.width = tile.height = 192;
  const g = tile.getContext('2d')!;
  const img = g.createImageData(192, 192);
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = img.data[i + 1] = img.data[i + 2] = rand() * 255;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return tile;
}

/** Paint a sample. `frame` jumps the grain like film. */
export function drawField(ctx: CanvasRenderingContext2D, W: number, H: number, k: FieldParams, s: FieldSample, frame: number) {
  const ramp = ramps[k.palette];
  const rows = s.bands.length;
  const h = H / rows;
  ctx.clearRect(0, 0, W, H);
  s.bands.forEach((vals, i) => {
    const g = ctx.createLinearGradient(0, 0, W, 0);
    if (k.steps > 0) {
      const n = vals.length;
      vals.forEach((v, b) => {
        const col = shade(ramp, v);
        g.addColorStop(b / n, col);
        g.addColorStop(Math.max(b / n, (b + 1) / n - 1e-4), col);
      });
    } else {
      vals.forEach((v, q) => g.addColorStop(q / STOPS, shade(ramp, v)));
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, Math.floor(i * h), W, Math.ceil(h) + 1);
  });
  if (k.lines > 0) {
    ctx.fillStyle = `rgba(255,255,255,${(k.lines / 100) * 0.3})`;
    for (let i = 1; i < rows; i++) ctx.fillRect(0, Math.round(i * h), W, 1);
  }
  if (k.grain > 0) {
    const pattern = ctx.createPattern(grainTile(), 'repeat')!;
    const o = (frame * 37) % 192;
    ctx.save();
    ctx.globalAlpha = (k.grain / 100) * 0.2;
    ctx.globalCompositeOperation = 'overlay';
    ctx.translate(-o, -o);
    ctx.fillStyle = pattern;
    ctx.fillRect(o, o, W, H);
    ctx.restore();
  }
}
