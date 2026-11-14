import { StrictMode, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { ACCENTS, Cell, Grid, Key, Readout, Slider, Stepper, Tape, Theme, Toggle, Wheel, type Accent } from '../src';
import '../src/styles.css';
import './site.css';
import { Code } from './Code';
import { drawField, PALETTES, sampleField, type FieldParams } from './field';

/* Glyphs: 24×24, 1.5px lines, drawn like the library's own. */
const glyph = (d: string, filled = false) => (
  <svg className="mo-glyph" viewBox="0 0 24 24" aria-hidden="true">
    <path d={d} fill={filled ? 'currentColor' : 'none'} stroke={filled ? 'none' : 'currentColor'} strokeWidth="1.5" />
  </svg>
);
const ICON = {
  play: glyph('M7 4.5l12 7.5-12 7.5z', true),
  up: glyph('M12 19V5M6 11l6-6 6 6'),
  bin: glyph('M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13'),
  loop: glyph('M5 12a7 7 0 1 0 2-5M5 4v4h4'),
  copy: glyph('M8 8h12v12H8zM16 8V4H4v12h4'),
};
const Swatch = (
  <svg className="mo-glyph" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" style={{ fill: 'var(--mo-accent)' }} /></svg>
);

function useMedia(query: string) {
  return useSyncExternalStore(
    (cb) => { const m = matchMedia(query); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); },
    () => matchMedia(query).matches,
  );
}

/* ---------- The Field sketch, live ---------- */
type Field = Omit<FieldParams, 'lens'>;
const FIELD: Field = {
  palette: 0, rows: 26, seams: 3, flow: 100, warp: 99, swell: 91, depth: 29, width: 65, grain: 100, lines: 100, steps: 20, mirror: true, invert: false,
};

/** What the board reads back from the field: overall brightness and its darkest and brightest bands. */
interface Reading { luma: number; trough: number; peak: number }

function FieldCanvas({ params, playing, lensOn, onRead }: { params: Field; playing: boolean; lensOn: boolean; onRead: (r: Reading) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef({ params, playing, lensOn, onRead });
  live.current = { params, playing, lensOn, onRead };
  const lens = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const c = canvas.current!;
    const ctx = c.getContext('2d')!;
    let raf = 0, t = 20, drift = 0, frame = 0, last = performance.now(), told = 0;
    const tick = (now: number) => {
      const { params: k, playing, lensOn, onRead } = live.current;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (playing) {
        t += dt;
        frame++;
        drift = (((drift + k.flow * 0.000035 * dt * 60) % 1) + 1) % 1;
      }
      const dpr = Math.min(2, devicePixelRatio || 1);
      const W = Math.round(c.clientWidth * dpr), H = Math.round(c.clientHeight * dpr);
      if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
      const full = { ...k, lens: lensOn ? lens.current : null };
      const sample = sampleField(full, t, drift);
      drawField(ctx, W, H, full, sample, frame);
      // Readouts update a few times a second: often enough to read as live, not so often the board re-renders every frame.
      if (now - told > 150) { told = now; onRead({ luma: sample.luma, trough: sample.trough, peak: sample.peak }); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas ref={canvas} className="hero__canvas" role="img"
      aria-label="Field: banded gradients with drifting seams, driven by the controls above"
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        lens.current = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
      }}
      onPointerLeave={() => { lens.current = null; }} />
  );
}

/**
 * The Field board, laid out for three widths. Each layout is a list of [control, width] whose rows close exactly,
 * so the board never has holes: 24 columns (two rows), 12 (four rows). On phones, 6 columns hold
 * just two steppers side by side and two full-row sliders.
 */
type Slot = [string, number];
const LAYOUT: Record<24 | 12 | 6, Slot[]> = {
  24: [
    ['play', 1], ['reset', 1], ['p0', 1], ['p1', 1], ['p2', 1], ['p3', 1], ['p4', 1],
    ['flow', 3], ['warp', 3], ['swell', 3], ['depth', 3], ['bands', 2], ['seams', 3],
    ['mirror', 1], ['invert', 1], ['lens', 1], ['width', 3], ['grain', 3], ['lines', 3], ['steps', 3], ['luma', 4], ['range', 5],
  ],
  12: [
    ['play', 1], ['reset', 1], ['p0', 1], ['p1', 1], ['p2', 1], ['p3', 1], ['p4', 1], ['mirror', 1], ['invert', 1], ['lens', 1], ['bands', 2],
    ['flow', 3], ['warp', 3], ['swell', 3], ['depth', 3],
    ['width', 3], ['grain', 3], ['lines', 3], ['steps', 3],
    ['seams', 3], ['luma', 3], ['range', 6],
  ],
  6: [
    ['bands', 3], ['seams', 3],
    ['flowSlider', 6],
    ['warpSlider', 6],
  ],
};

/* ---------- Page parts ---------- */

/** The row above each section: its name, as in the nav, and what to do there (if anything). */
function Meta({ title, note }: { title: string; note?: string }) {
  return (
    <div className="g meta">
      <span className="meta__title">{title}</span>
      {note && <span className="meta__note">{note}</span>}
    </div>
  );
}

function CopyKey({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(false), 1400);
    return () => clearTimeout(t);
  }, [done]);
  const press = async () => {
    try { await navigator.clipboard.writeText(text); setDone(true); } catch { /* clipboard blocked */ }
  };
  return <Key scale="s" label={done ? 'Copied' : 'Copy'} icon={ICON.copy} onPress={press} />;
}

/* ---------- Hero ---------- */
function Hero({ dark, setDark }: { dark: boolean; setDark: (d: boolean) => void }) {
  const [k, setK] = useState<Field>(FIELD);
  const reduced = useMedia('(prefers-reduced-motion: reduce)');
  const [playing, setPlaying] = useState(!reduced);
  const [lensOn, setLensOn] = useState(false);
  const [read, setRead] = useState<Reading>({ luma: 0, trough: 0, peak: 0 });
  const undo = useRef<Field>(FIELD);
  const wide = useMedia('(min-width: 1280px)');
  const medium = useMedia('(min-width: 800px)');
  const cols = wide ? 24 : medium ? 12 : 6;
  const set = <K extends keyof Field>(key: K) => (v: Field[K]) => setK((p) => ({ ...p, [key]: v }));
  const wheel = (key: 'flow' | 'warp' | 'swell' | 'depth' | 'width' | 'grain' | 'lines', label: string, w: number, help?: string) => (
    <Wheel key={key} label={label} min={key === 'flow' ? -100 : 0} max={100} value={k[key]} onValueChange={set(key)} w={w} help={help} />
  );

  const controls: Record<string, (w: number) => ReactNode> = {
    play: () => <Key key="play" mode="latch" process label="Play" onLabel="Live" icon={ICON.play} pressed={playing} onPressedChange={setPlaying} />,
    reset: () => <Key key="reset" mode="hold" label="Reset" icon={ICON.loop} undoMs={4000} help="Hold to reset every control"
      onConfirm={() => { undo.current = k; setK(FIELD); }} onUndo={() => setK(undo.current)} />,
    ...Object.fromEntries(PALETTES.map((p, i) => [`p${i}`, () => (
      <Key key={p.name} mode="latch" label={p.name} pressed={k.palette === i} onPressedChange={() => set('palette')(i)} />
    )])),
    flow: (w) => wheel('flow', 'Flow', w, 'How fast the seams drift; negative runs them back'),
    warp: (w) => wheel('warp', 'Warp', w, 'How far each band bends its seams'),
    swell: (w) => wheel('swell', 'Swell', w, 'A slow ripple along each band'),
    depth: (w) => wheel('depth', 'Depth', w, 'How dark the middle bands go'),
    width: (w) => wheel('width', 'Width', w, 'How wide each seam is'),
    grain: (w) => wheel('grain', 'Noise', w, 'Film grain over the field'),
    lines: (w) => wheel('lines', 'Lines', w, 'Hairlines between bands'),
    flowSlider: (w) => <Slider key="flowSlider" label="Flow" min={-100} max={100} value={k.flow} onValueChange={set('flow')} w={w} help="How fast the seams drift; negative runs them back" />,
    warpSlider: (w) => <Slider key="warpSlider" label="Warp" min={0} max={100} value={k.warp} onValueChange={set('warp')} w={w} help="How far each band bends its seams" />,
    bands: (w) => <Stepper key="bands" label="Bands" min={3} max={32} value={k.rows} onValueChange={set('rows')} w={w} />,
    seams: (w) => <Stepper key="seams" label="Seams" min={0} max={9} value={k.seams} onValueChange={set('seams')} w={w} />,
    steps: (w) => <Stepper key="steps" label="Steps" min={0} max={64} step={4} value={k.steps} onValueChange={set('steps')} w={w} help="Posterise each band into this many blocks; 0 is smooth" />,
    mirror: () => <Toggle key="mirror" label="Mirror" checked={k.mirror} onCheckedChange={set('mirror')} help="Darken the middle instead of the bottom" />,
    invert: () => <Toggle key="invert" label="Invert" checked={k.invert} onCheckedChange={set('invert')} help="Seams light instead of dark" />,
    lens: () => <Toggle key="lens" label="Lens" checked={lensOn} onCheckedChange={setLensOn} help="The pointer opens a seam where it hovers" />,
    luma: (w) => <Cell key="luma" w={w} tone="inverse"><Readout label="Luminance" value={read.luma.toFixed(3)} /></Cell>,
    range: (w) => <Cell key="range" w={w}><Readout label="Range" value={`${read.trough.toFixed(2)}–${read.peak.toFixed(2)}`} /></Cell>,
  };

  return (
    <header className="hero" id="top">
      <div className="g top">
        <a className="wordmark" href="#top">Molette</a>
        <nav className="nav" aria-label="Sections">
          <a href="#components">Components,</a> <a href="#theming">Theming,</a> <a href="#install">Install</a>
        </nav>
        <button className="top__mode" onClick={() => setDark(!dark)}>{dark ? 'Light' : 'Dark'}</button>
      </div>

      <p className="g intro">
        <span>
          Molette is a set of React controls for creative coding. Sliders, steppers, toggles and keys snap to the
          square cells of a golden-ratio grid and close into one board that sits beside your sketch.
        </span>
      </p>

      <Meta title="Field" note="A live sketch. Every control on this page is Molette." />
      <div className="strip">
        <Grid cols={cols} fluid scale="s" aria-label="Field controls">
          {LAYOUT[cols].map(([id, w]) => controls[id](w))}
        </Grid>
      </div>
      <div className="frame">
        <FieldCanvas params={k} playing={playing} lensOn={lensOn} onRead={setRead} />
      </div>
    </header>
  );
}

/* ---------- Components ---------- */
function Specimen({ name, what, children }: { name: string; what: string; children: ReactNode }) {
  return (
    <article className="spec">
      <div className="spec__stage"><div className="spec__board">{children}</div></div>
      <h3 className="spec__name">{name}</h3>
      <p className="spec__what">{what}</p>
    </article>
  );
}

function Components() {
  return (
    <section className="sec" id="components" aria-labelledby="components-h">
      <Meta title="Components" />
      <div className="g sec__lead">
        <h2 id="components-h">Every control is a whole number of cells, so any set of them closes into a board.</h2>
      </div>
      <div className="g specs">
        <Specimen name="Key" what="Press, latch, run, or hold to confirm with undo.">
          <Grid cols={4} fluid>
            <Key primary label="Deploy" icon={ICON.up} />
            <Key mode="latch" process label="Play" onLabel="Playing" icon={ICON.play} />
            <Key mode="latch" label="Loop" icon={ICON.loop} defaultPressed />
            <Key mode="hold" label="Delete" icon={ICON.bin} undoMs={5000} onConfirm={() => {}} />
          </Grid>
        </Specimen>
        <Specimen name="Toggle" what="A switch, or two words as a radio group.">
          <Grid cols={4} fluid>
            <Toggle label="Ember" defaultChecked />
            <Toggle label="Snap" accent="green" defaultChecked help="This one has its own accent" />
            <Toggle pair={['Auto', 'Manual']} label="Mode" w={2} />
          </Grid>
        </Specimen>
        <Specimen name="Stepper" what="Value, minus and plus in one cell. Changed digits roll.">
          <Grid cols={4} fluid>
            <Stepper label="Tempo" unit="bpm" min={40} max={240} defaultValue={120} w={2} />
            <Stepper label="Lines" min={1} max={64} defaultValue={12} w={2} />
          </Grid>
        </Specimen>
        <Specimen name="Slider" what="A ruler that slides under a fixed, footed thumb.">
          <Grid cols={4} fluid>
            <Slider label="Volume" unit="%" defaultValue={72} w={3} />
            <Slider label="Gain" unit="dB" min={-24} max={24} defaultValue={-6} w={1} h={2} />
            <Slider label="Tracking" unit="%" min={-100} max={100} defaultValue={30} w={3} />
          </Grid>
        </Specimen>
        <Specimen name="Tape and Wheel" what="The ruler, bare, or on a drum that coasts when flicked.">
          <Grid cols={4} fluid>
            <Tape label="Zoom" unit="%" min={25} max={400} step={5} defaultValue={100} w={4} />
            <Wheel label="Hue" unit="°" min={0} max={360} defaultValue={210} w={4} />
          </Grid>
        </Specimen>
        <Specimen name="Readout" what="Label, value and unit, on any tone.">
          <Grid cols={4} fluid>
            <Cell w={2} tone="inverse"><Readout label="Tempo" value={120} unit="bpm" /></Cell>
            <Cell w={2} tone="accent"><Readout label="Frame" value={1440} /></Cell>
            <Cell w={2} tone="sunk"><Readout label="Seed" value={8} /></Cell>
            <Cell w={2}><Readout label="Scale" value={1.618} /></Cell>
          </Grid>
        </Specimen>
      </div>
    </section>
  );
}

/* ---------- Theming ---------- */
interface Look { dark: boolean; accent: Accent | undefined; marks: boolean; round: number; hue: number }

function Theming({ look, set }: { look: Look; set: (p: Partial<Look>) => void }) {
  const wide = useMedia('(min-width: 1100px)');
  const names = Object.keys(ACCENTS) as (keyof typeof ACCENTS)[];
  const swatch = (name: keyof typeof ACCENTS) => (
    <Key key={name} mode="latch" w={2} accent={name} label={name[0].toUpperCase() + name.slice(1)} icon={Swatch}
      pressed={look.accent === name || (name === 'orange' && look.accent === undefined)}
      onPressedChange={() => set({ accent: name === 'orange' ? undefined : name })} />
  );
  return (
    <section className="sec" id="theming" aria-labelledby="theming-h">
      <Meta title="Theming" note="These controls re-skin this page." />
      <div className="g split">
        <div className="split__a">
          <Grid cols={wide ? 8 : 4} fluid scale="s" aria-label="Theme">
            {names.map(swatch)}
            <Toggle label="Accent marks" w={2} checked={look.marks} onCheckedChange={(m) => set({ marks: m })} help="Draw fills, ticks and switches in the accent" />
            <Toggle pair={['Light', 'Dark']} label="Appearance" w={2} checked={!look.dark} onCheckedChange={(c) => set({ dark: !c })} />
            <Tape label="Radius" unit="%" min={0} max={25} value={look.round} onValueChange={(r) => set({ round: r })} w={4} />
            <Wheel label="Any colour" unit="°" min={0} max={360} value={look.hue} w={4}
              onValueChange={(h) => set({ hue: h, accent: `oklch(0.66 0.16 ${h})` })} />
          </Grid>
        </div>
        <div className="split__b">
          <h2 id="theming-h">One colour in. Molette mixes the rest against the cell and ink, so any accent works in light and dark.</h2>
        </div>
      </div>
    </section>
  );
}

/* ---------- Install ---------- */
const USAGE = `import { Grid, Key, Toggle, Slider } from 'molette';
import 'molette/styles.css';

<Grid cols={8}>
  <Key mode="latch" process label="Play" />
  <Toggle label="Outline" defaultChecked />
  <Slider label="Tracking" unit="%" min={-100} max={100} w={4}
    onValueChange={setTracking} />
</Grid>`;

function Install() {
  return (
    <section className="sec" id="install" aria-labelledby="install-h">
      <Meta title="Install" note="React 18 or 19." />
      <div className="g split">
        <div className="split__a">
          <div className="install">
            <code className="install__cmd">npm install molette</code>
            <CopyKey text="npm install molette" />
          </div>
        </div>
        <div className="split__b">
          <h2 id="install-h">Feed the values into p5.js, Canvas or WebGL from onValueChange.</h2>
          <Code>{USAGE}</Code>
        </div>
      </div>
    </section>
  );
}

/* ---------- App ---------- */
const q = new URLSearchParams(location.search);
const systemDark = matchMedia('(prefers-color-scheme: dark)').matches;

function App() {
  const [look, setLook] = useState<Look>({
    dark: q.has('dark') || (!q.has('light') && systemDark),
    accent: q.get('accent') ?? undefined,
    marks: q.has('marks'),
    round: Number(q.get('radius') ?? 0),
    hue: 250,
  });
  const set = (p: Partial<Look>) => setLook((l) => ({ ...l, ...p }));

  // The page around the boards follows the same theme, out to the edges of the window.
  useEffect(() => {
    document.documentElement.dataset.theme = look.dark ? 'dark' : 'light';
  }, [look.dark]);

  return (
    <Theme appearance={look.dark ? 'dark' : 'light'} accent={look.accent} marks={look.marks ? 'accent' : 'ink'} radius={look.round / 100} className="site">
      <main>
        <Hero dark={look.dark} setDark={(d) => set({ dark: d })} />
        <Components />
        <Theming look={look} set={set} />
        <Install />
      </main>
      <footer className="g foot">
        <span className="foot__a">MIT License</span>
        <a className="foot__b" href="#top">Back to top</a>
      </footer>
    </Theme>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
