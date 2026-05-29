import type { LagPlayer } from '@lagplayer/player';
import { ColorCorrectionFilter } from './ColorCorrectionFilter';
import { LevelsFilter } from './LevelsFilter';
import css from './ImageControls.css?raw';
import html from './ImageControls.html?raw';

const COLOR_ORDER = 0;
const LEVELS_ORDER = 1;

function fmt(v: number): string {
  return v > 0 ? `+${v}` : String(v);
}

export class LagImageControls extends HTMLElement {
  private readonly shadow: ShadowRoot;

  // Levels state
  private blackPoint = 0;
  private whitePoint = 100;
  private midtone = 0;
  // Color state
  private temperature = 0;
  private tint = 0;
  private saturation = 0;

  // Histogram
  private lastImageData?: ImageData;
  private comparingLevels = false;
  private comparingColor  = false;

  // Lifecycle cleanup
  private unregisterBtn?: () => void;
  private unregisterFrame?: () => void;

  // Cached button refs — assigned in initUI before any event fires
  private levelsCmpBtn!: HTMLButtonElement;
  private levelsRstBtn!: HTMLButtonElement;
  private colorCmpBtn!: HTMLButtonElement;
  private colorRstBtn!: HTMLButtonElement;
  private allCmpBtn!: HTMLButtonElement;
  private allRstBtn!: HTMLButtonElement;

  // Player reference set by init
  private player: LagPlayer | null = null;

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: 'open' });
    this.shadow.innerHTML = `<style>${css}</style>${html}`;
    this.initUI();
  }

  connectedCallback(): void {
    this.style.display = 'none';
  }

  disconnectedCallback(): void {
    this.destroy();
  }

  init(player: LagPlayer): void {
    this.destroy();
    this.player = player;

    player.registerFilterRenderer(new ColorCorrectionFilter());
    player.registerFilterRenderer(new LevelsFilter());

    this.unregisterBtn = player.registerControlButton({
      icon: '◑',
      title: 'Image',
      onClick: (btn) => {
        const opening = this.style.display === 'none';
        this.style.display = opening ? 'block' : 'none';
        if (opening) {
          btn.dataset.active = '';
          this.unregisterFrame = player.registerFrameCallback(data => this.drawHistogram(data));
          const frame = player.captureFrame();
          if (frame) this.drawHistogram(frame);
          else this.renderHistogram();
        } else {
          delete btn.dataset.active;
          this.unregisterFrame?.();
          this.unregisterFrame = undefined;
        }
      },
    });
  }

  destroy(): void {
    this.unregisterBtn?.();
    this.unregisterFrame?.();
    this.unregisterBtn = undefined;
    this.unregisterFrame = undefined;
    this.player = null;
  }

  // ── Dirty checks ─────────────────────────────────────────────────────────

  private isDirtyLevels(): boolean {
    return this.blackPoint !== 0 || this.whitePoint !== 100 || this.midtone !== 0;
  }

  private isDirtyColor(): boolean {
    return this.temperature !== 0 || this.tint !== 0 || this.saturation !== 0;
  }

  private syncButtons(): void {
    const dl = this.isDirtyLevels();
    const dc = this.isDirtyColor();
    const da = dl || dc;
    this.levelsCmpBtn.disabled = !dl;
    this.levelsRstBtn.disabled = !dl;
    this.colorCmpBtn.disabled  = !dc;
    this.colorRstBtn.disabled  = !dc;
    this.allCmpBtn.disabled    = !da;
    this.allRstBtn.disabled    = !da;
  }

  // ── Filter application ────────────────────────────────────────────────────

  private applyLevelsFilter(): void {
    const player = this.player;
    if (!player) return;
    if (this.isDirtyLevels()) {
      player.setFilter({
        id: 'levels', type: 'levels', order: LEVELS_ORDER,
        params: { blackPoint: this.blackPoint, whitePoint: this.whitePoint, midtone: this.midtone },
      });
    } else {
      player.removeFilter('levels');
    }
  }

  private applyColorFilter(): void {
    const player = this.player;
    if (!player) return;
    if (this.isDirtyColor()) {
      player.setFilter({
        id: 'colorCorrection', type: 'colorCorrection', order: COLOR_ORDER,
        params: { temperature: this.temperature, tint: this.tint, saturation: this.saturation },
      });
    } else {
      player.removeFilter('colorCorrection');
    }
  }

  // ── UI initialisation ─────────────────────────────────────────────────────

  private initUI(): void {
    const q = <T extends Element>(s: string) => this.shadow.querySelector<T>(s)!;

    // Levels inputs
    const blackSlider = q<HTMLInputElement>('.black-slider');
    const whiteSlider = q<HTMLInputElement>('.white-slider');
    const midSlider   = q<HTMLInputElement>('.mid-slider');
    const blackVal    = q<HTMLSpanElement>('.black-val');
    const whiteVal    = q<HTMLSpanElement>('.white-val');
    const midVal      = q<HTMLSpanElement>('.mid-val');

    // Color inputs
    const tempSlider  = q<HTMLInputElement>('.temp-slider');
    const tintSlider  = q<HTMLInputElement>('.tint-slider');
    const satSlider   = q<HTMLInputElement>('.sat-slider');
    const tempVal     = q<HTMLSpanElement>('.temp-val');
    const tintVal     = q<HTMLSpanElement>('.tint-val');
    const satVal      = q<HTMLSpanElement>('.sat-val');

    // Buttons
    this.levelsCmpBtn = q<HTMLButtonElement>('.levels-cmp-btn');
    this.levelsRstBtn = q<HTMLButtonElement>('.levels-rst-btn');
    this.colorCmpBtn  = q<HTMLButtonElement>('.color-cmp-btn');
    this.colorRstBtn  = q<HTMLButtonElement>('.color-rst-btn');
    this.allCmpBtn    = q<HTMLButtonElement>('.all-cmp-btn');
    this.allRstBtn    = q<HTMLButtonElement>('.all-rst-btn');

    this.syncButtons();

    // ── Levels sliders ──────────────────────────────────────────────────────

    blackSlider.addEventListener('input', () => {
      this.blackPoint = Number(blackSlider.value);
      blackVal.textContent = String(this.blackPoint);
      this.syncButtons(); this.applyLevelsFilter(); this.renderHistogram();
    });

    whiteSlider.addEventListener('input', () => {
      this.whitePoint = Number(whiteSlider.value);
      whiteVal.textContent = String(this.whitePoint);
      this.syncButtons(); this.applyLevelsFilter(); this.renderHistogram();
    });

    midSlider.addEventListener('input', () => {
      this.midtone = Number(midSlider.value);
      midVal.textContent = fmt(this.midtone);
      this.syncButtons(); this.applyLevelsFilter(); this.renderHistogram();
    });

    // ── Levels compare (hold) ───────────────────────────────────────────────

    const stopLevelsCmp = () => {
      this.levelsCmpBtn.classList.remove('active');
      this.comparingLevels = false;
      this.applyLevelsFilter();
      this.renderHistogram();
    };
    this.levelsCmpBtn.addEventListener('pointerdown', (e) => {
      if (this.levelsCmpBtn.disabled) return;
      e.preventDefault();
      this.levelsCmpBtn.setPointerCapture(e.pointerId);
      this.levelsCmpBtn.classList.add('active');
      this.comparingLevels = true;
      this.player?.removeFilter('levels');
      this.renderHistogram();
    });
    this.levelsCmpBtn.addEventListener('pointerup', stopLevelsCmp);
    this.levelsCmpBtn.addEventListener('pointercancel', stopLevelsCmp);

    // ── Levels reset ────────────────────────────────────────────────────────

    this.levelsRstBtn.addEventListener('click', () => {
      this.blackPoint = 0; this.whitePoint = 100; this.midtone = 0;
      blackSlider.value = '0'; whiteSlider.value = '100'; midSlider.value = '0';
      blackVal.textContent = '0'; whiteVal.textContent = '100'; midVal.textContent = '0';
      this.syncButtons(); this.applyLevelsFilter(); this.renderHistogram();
    });

    // ── Color sliders ───────────────────────────────────────────────────────

    tempSlider.addEventListener('input', () => {
      this.temperature = Number(tempSlider.value);
      tempVal.textContent = fmt(this.temperature);
      this.syncButtons(); this.applyColorFilter(); this.renderHistogram();
    });

    tintSlider.addEventListener('input', () => {
      this.tint = Number(tintSlider.value);
      tintVal.textContent = fmt(this.tint);
      this.syncButtons(); this.applyColorFilter(); this.renderHistogram();
    });

    satSlider.addEventListener('input', () => {
      this.saturation = Number(satSlider.value);
      satVal.textContent = fmt(this.saturation);
      this.syncButtons(); this.applyColorFilter(); this.renderHistogram();
    });

    // ── Color compare (hold) ────────────────────────────────────────────────

    const stopColorCmp = () => {
      this.colorCmpBtn.classList.remove('active');
      this.comparingColor = false;
      this.applyColorFilter();
      this.renderHistogram();
    };
    this.colorCmpBtn.addEventListener('pointerdown', (e) => {
      if (this.colorCmpBtn.disabled) return;
      e.preventDefault();
      this.colorCmpBtn.setPointerCapture(e.pointerId);
      this.colorCmpBtn.classList.add('active');
      this.comparingColor = true;
      this.player?.removeFilter('colorCorrection');
      this.renderHistogram();
    });
    this.colorCmpBtn.addEventListener('pointerup', stopColorCmp);
    this.colorCmpBtn.addEventListener('pointercancel', stopColorCmp);

    // ── Color reset ─────────────────────────────────────────────────────────

    this.colorRstBtn.addEventListener('click', () => {
      this.temperature = 0; this.tint = 0; this.saturation = 0;
      tempSlider.value = '0'; tintSlider.value = '0'; satSlider.value = '0';
      tempVal.textContent = '0'; tintVal.textContent = '0'; satVal.textContent = '0';
      this.syncButtons(); this.applyColorFilter(); this.renderHistogram();
    });

    // ── Overall compare (hold) ──────────────────────────────────────────────

    const stopAllCmp = () => {
      this.allCmpBtn.classList.remove('active');
      this.comparingLevels = false;
      this.comparingColor  = false;
      this.applyLevelsFilter();
      this.applyColorFilter();
      this.renderHistogram();
    };
    this.allCmpBtn.addEventListener('pointerdown', (e) => {
      if (this.allCmpBtn.disabled) return;
      e.preventDefault();
      this.allCmpBtn.setPointerCapture(e.pointerId);
      this.allCmpBtn.classList.add('active');
      this.comparingLevels = true;
      this.comparingColor  = true;
      const player = this.player;
      if (player) {
        player.removeFilter('levels');
        player.removeFilter('colorCorrection');
      }
      this.renderHistogram();
    });
    this.allCmpBtn.addEventListener('pointerup', stopAllCmp);
    this.allCmpBtn.addEventListener('pointercancel', stopAllCmp);

    // ── Overall reset ───────────────────────────────────────────────────────

    this.allRstBtn.addEventListener('click', () => {
      this.blackPoint = 0; this.whitePoint = 100; this.midtone = 0;
      blackSlider.value = '0'; whiteSlider.value = '100'; midSlider.value = '0';
      blackVal.textContent = '0'; whiteVal.textContent = '100'; midVal.textContent = '0';

      this.temperature = 0; this.tint = 0; this.saturation = 0;
      tempSlider.value = '0'; tintSlider.value = '0'; satSlider.value = '0';
      tempVal.textContent = '0'; tintVal.textContent = '0'; satVal.textContent = '0';

      this.syncButtons();
      this.applyLevelsFilter();
      this.applyColorFilter();
      this.renderHistogram();
    });
  }

  // ── Histogram ─────────────────────────────────────────────────────────────

  private drawHistogram(imageData: ImageData): void {
    this.lastImageData = imageData;
    this.renderHistogram();
  }

  private renderHistogram(): void {
    const canvas = this.shadow.querySelector<HTMLCanvasElement>('.histogram');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);

    if (!this.lastImageData) return;

    const adjusted = new Uint8ClampedArray(this.lastImageData.data);
    if (this.isDirtyColor()  && !this.comparingColor)  this.applyColorToPixels(adjusted);
    if (this.isDirtyLevels() && !this.comparingLevels) this.applyLevelsToPixels(adjusted);

    const bins = 256;
    const r = new Float32Array(bins);
    const g = new Float32Array(bins);
    const b = new Float32Array(bins);
    for (let i = 0; i < adjusted.length; i += 4) {
      r[adjusted[i]]++;
      g[adjusted[i + 1]]++;
      b[adjusted[i + 2]]++;
    }
    let rMax = 0, gMax = 0, bMax = 0;
    for (let i = 0; i < bins; i++) {
      if (r[i] > rMax) rMax = r[i];
      if (g[i] > gMax) gMax = g[i];
      if (b[i] > bMax) bMax = b[i];
    }
    const bw = width / bins;
    const channels: [Float32Array, number, string][] = [
      [b, bMax, 'rgba(80,130,255,0.55)'],
      [g, gMax, 'rgba(80,210,80,0.55)'],
      [r, rMax, 'rgba(255,80,80,0.55)'],
    ];
    for (const [hist, chMax, color] of channels) {
      if (chMax === 0) continue;
      ctx.fillStyle = color;
      for (let i = 0; i < bins; i++) {
        const h = (hist[i] / chMax) * height;
        if (h < 0.5) continue;
        ctx.fillRect(i * bw, height - h, Math.ceil(bw), h);
      }
    }
  }

  private applyLevelsToPixels(data: Uint8ClampedArray): void {
    const bIn = this.blackPoint / 100;
    const wIn = this.whitePoint / 100;
    const exponent = Math.pow(2, -this.midtone / 100);
    const range = Math.max(wIn - bIn, 0.001);
    const slope = 1 / range;
    const intercept = -bIn / range;
    const hasGamma = Math.abs(exponent - 1) > 1e-4;
    for (let i = 0; i < data.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        let v = data[i + c] / 255;
        v = Math.max(0, Math.min(1, slope * v + intercept));
        if (hasGamma) v = Math.pow(v, exponent);
        data[i + c] = Math.round(v * 255);
      }
    }
  }

  private applyColorToPixels(data: Uint8ClampedArray): void {
    const t = this.temperature / 100;
    const m = this.tint / 100;
    const satValue = Math.max(0, 1 + this.saturation / 100);
    const hasSat = Math.abs(satValue - 1) > 1e-4;
    const rScale = 1 + 0.4 * t;
    const gScale = (1 - 0.05 * Math.abs(t)) * (1 - 0.3 * m);
    const bScale = 1 - 0.4 * t;
    for (let i = 0; i < data.length; i += 4) {
      let r = data[i] * rScale;
      let g = data[i + 1] * gScale;
      let b = data[i + 2] * bScale;
      if (hasSat) {
        const luma = 0.213 * r + 0.715 * g + 0.072 * b;
        r = luma + satValue * (r - luma);
        g = luma + satValue * (g - luma);
        b = luma + satValue * (b - luma);
      }
      data[i]     = Math.max(0, Math.min(255, Math.round(r)));
      data[i + 1] = Math.max(0, Math.min(255, Math.round(g)));
      data[i + 2] = Math.max(0, Math.min(255, Math.round(b)));
    }
  }
}
