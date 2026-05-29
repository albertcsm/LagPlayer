import { FilterPipeline } from './filters/FilterPipeline';
import type { FilterConfig, FilterRenderer } from './filters/types';
import { MediaInfo } from './components/MediaInfo';
import { PlaybackSpeed } from './components/PlaybackSpeed';
import { ControlsAutoHide } from './components/ControlsAutoHide';

export interface ControlButtonConfig {
  /** Button label — a short Unicode symbol or emoji. */
  icon: string;
  /** Tooltip shown on hover. */
  title: string;
  /** Called with the button element so the addon can manage its active state. */
  onClick: (btn: HTMLButtonElement) => void;
}

let instanceCount = 0;

// Attributes forwarded to the inner <video> element (not controls, which we own).
const VIDEO_ATTRS = ['src', 'autoplay', 'loop', 'muted', 'poster'] as const;

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
}

export class LagPlayer extends HTMLElement {
  static observedAttributes: string[] = [...VIDEO_ATTRS];

  private readonly shadow: ShadowRoot;
  private readonly video: HTMLVideoElement;
  private readonly contentEl: HTMLDivElement;
  private readonly videoLayerEl: HTMLDivElement;
  private readonly controlsEl: HTMLDivElement;
  private readonly filterEl: SVGFilterElement;
  private readonly pipeline: FilterPipeline;
  private readonly filterId: string;

  // Frame sampling for addons (e.g. histogram)
  private readonly frameCallbacks: Set<(data: ImageData) => void> = new Set();
  private onFullscreenChange!: () => void;
  private sampleCanvas?: HTMLCanvasElement;
  private sampleCtx?: CanvasRenderingContext2D | null;
  private frameLoopHandle?: number;

  // Bundled components
  private readonly mediaInfo = new MediaInfo();
  private readonly playbackSpeed = new PlaybackSpeed();
  private readonly controlsAutoHide = new ControlsAutoHide();

  constructor() {
    super();
    this.filterId = `lag-filter-${instanceCount++}`;
    this.pipeline = new FilterPipeline();
    this.shadow = this.attachShadow({ mode: 'open' });

    this.shadow.innerHTML = `
      <style>
        :host {
          display: block;
          position: relative;
          background: #000;
          overflow: hidden;
          --ctrl-bg: linear-gradient(transparent, rgba(0,0,0,0.55));
        }

        /* ── Video frame area (filter applied here) ── */
        .content {
          width: 100%;
          height: 100%;
        }
        video {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: contain;
        }
        svg {
          position: absolute;
          width: 0;
          height: 0;
          overflow: hidden;
          pointer-events: none;
        }

        /* ── Overlay container (for bundled components and addons) ── */
        .overlays {
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 25;
        }

        /* ── Controls (sibling of .content – never filtered) ── */
        .controls {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          padding: 8px 14px 12px;
          background: var(--ctrl-bg);
          display: flex;
          flex-direction: column;
          gap: 6px;
          opacity: 0;
          transition: opacity 0.15s;
          pointer-events: none;
          z-index: 20;
        }
        :host([data-controls-visible]) .controls,
        :host([data-paused]) .controls {
          opacity: 1;
          pointer-events: auto;
        }

        .progress {
          width: 100%;
          height: 10px;
          border-top: 5px solid transparent;
          border-bottom: 5px solid transparent;
          background-color: rgba(255,255,255,0.25);
          background-clip: padding-box;
          border-radius: 10px;
          cursor: pointer;
          position: relative;
        }
        .progress-fill {
          height: 100%;
          background: #fff;
          border-radius: 2px;
          pointer-events: none;
        }
        .progress-buffer {
          position: absolute;
          top: 0; left: 0; height: 100%;
          background: rgba(255,255,255,0.25);
          border-radius: 2px;
          pointer-events: none;
        }

        .ctrl-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        button {
          background: none;
          border: none;
          color: #fff;
          cursor: pointer;
          font-size: 19px;
          padding: 4px 6px;
          line-height: 1;
          flex-shrink: 0;
          opacity: 0.9;
          position: relative;
        }
        button::after {
          content: '';
          position: absolute;
          inset: -5px;
        }
        button:hover { opacity: 1; }
        button[data-active] {
          opacity: 1;
          background: rgba(255,255,255,0.15);
          border-radius: 5px;
        }

        .time {
          font-size: 13px;
          color: rgba(255,255,255,0.85);
          font-variant-numeric: tabular-nums;
          flex-shrink: 0;
        }

        .volume-wrap {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .volume {
          width: 68px;
          accent-color: #fff;
          cursor: pointer;
          flex-shrink: 0;
        }

        .spacer { flex: 1; }
      </style>

      <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <filter id="${this.filterId}" color-interpolation-filters="sRGB"></filter>
        </defs>
      </svg>

      <!-- Filter is applied to this wrapper, NOT to the <video> directly,
           so the controls panel (outside .content) is never filtered. -->
      <div class="content">
        <video></video>
      </div>

      <div class="overlays" aria-hidden="true"></div>

      <slot></slot>

      <div class="controls">
        <div class="progress">
          <div class="progress-buffer"></div>
          <div class="progress-fill"></div>
        </div>
        <div class="ctrl-row">
          <button class="play-btn">▶</button>
          <span class="time">0:00 / 0:00</span>
          <div class="spacer"></div>
          <div class="volume-wrap">
            <button class="mute-btn">🔊</button>
            <input class="volume" type="range" min="0" max="1" step="0.01" value="1">
          </div>
          <button class="fs-btn">⤢</button>
        </div>
      </div>
    `;

    this.video = this.shadow.querySelector('video')!;
    this.contentEl = this.shadow.querySelector('.content')!;
    this.controlsEl = this.shadow.querySelector('.controls')!;
    this.filterEl = this.shadow.querySelector('filter')!;

    // Video-layer container: sits above the video but below UI controls and overlay panels.
    this.videoLayerEl = document.createElement('div');
    Object.assign(this.videoLayerEl.style, {
      position: 'absolute', inset: '0', zIndex: '15', pointerEvents: 'none',
    });
    this.contentEl.insertAdjacentElement('afterend', this.videoLayerEl);

    this.initControls();
  }

  connectedCallback(): void {
    this.video.paused
      ? this.setAttribute('data-paused', '')
      : this.removeAttribute('data-paused');
    this.mediaInfo.init(this);
    this.playbackSpeed.init(this);
    this.controlsAutoHide.init(this);
  }

  disconnectedCallback(): void {
    this.stopFrameLoop();
    document.removeEventListener('fullscreenchange', this.onFullscreenChange);
    this.mediaInfo.destroy();
    this.playbackSpeed.destroy();
    this.controlsAutoHide.destroy();
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (value === null) this.video.removeAttribute(name);
    else this.video.setAttribute(name, value);
  }

  setFilter(config: FilterConfig): void {
    this.pipeline.set(config);
    this.syncFilter();
  }

  removeFilter(id: string): void {
    this.pipeline.remove(id);
    this.syncFilter();
  }

  registerFilterRenderer(renderer: FilterRenderer): void {
    this.pipeline.registerRenderer(renderer);
  }

  get videoElement(): HTMLVideoElement {
    return this.video;
  }

  /**
   * Inserts a button into the controls bar before the fullscreen button.
   * Returns a function that removes the button (call from disconnectedCallback).
   */
  registerControlButton(config: ControlButtonConfig): () => void {
    const btn = document.createElement('button');
    btn.textContent = config.icon;
    btn.title = config.title;
    btn.addEventListener('click', () => config.onClick(btn));

    const fsBtn = this.shadow.querySelector<HTMLButtonElement>('.fs-btn')!;
    fsBtn.insertAdjacentElement('beforebegin', btn);

    return () => btn.remove();
  }

  /** Show the controls bar immediately with a fast fade-in. */
  showControls(): void {
    this.controlsEl.style.transition = 'opacity 0.15s';
    this.setAttribute('data-controls-visible', '');
  }

  /** Hide the controls bar with a slow fade-out. No-op while paused. */
  hideControls(): void {
    this.controlsEl.style.transition = 'opacity 0.4s';
    this.removeAttribute('data-controls-visible');
  }

  /**
   * Appends an element into the overlay container (above the video, below the controls).
   * Returns a function that removes the element.
   */
  registerOverlay(el: HTMLElement): () => void {
    this.shadow.querySelector('.overlays')!.appendChild(el);
    return () => el.remove();
  }

  /**
   * Appends an element into the video-layer container (z-index 15: above video,
   * below UI controls and overlay panels). Intended for full-frame rendering canvases.
   * Returns a function that removes the element.
   */
  registerVideoLayer(el: HTMLElement): () => void {
    this.videoLayerEl.appendChild(el);
    return () => el.remove();
  }

  /**
   * Register a callback that receives ImageData sampled from each rendered video frame.
   * The callback fires on every new frame (via requestVideoFrameCallback when available,
   * falling back to requestAnimationFrame). Returns a cleanup function.
   */
  registerFrameCallback(fn: (data: ImageData) => void): () => void {
    this.frameCallbacks.add(fn);
    if (this.frameCallbacks.size === 1) this.startFrameLoop();
    return () => {
      this.frameCallbacks.delete(fn);
      if (this.frameCallbacks.size === 0) this.stopFrameLoop();
    };
  }

  private startFrameLoop(): void {
    const useRVFC = 'requestVideoFrameCallback' in this.video;
    const tick = () => {
      this.sampleFrame();
      if (this.frameCallbacks.size === 0) return;
      if (useRVFC) {
        this.frameLoopHandle = this.video.requestVideoFrameCallback(tick);
      } else {
        this.frameLoopHandle = requestAnimationFrame(tick);
      }
    };
    this.frameLoopHandle = useRVFC
      ? this.video.requestVideoFrameCallback(tick)
      : requestAnimationFrame(tick);
  }

  private stopFrameLoop(): void {
    if (this.frameLoopHandle === undefined) return;
    if ('cancelVideoFrameCallback' in this.video) {
      this.video.cancelVideoFrameCallback(this.frameLoopHandle);
    } else {
      cancelAnimationFrame(this.frameLoopHandle);
    }
    this.frameLoopHandle = undefined;
  }

  /** Capture the currently displayed video frame as ImageData. Returns null if the
   *  video has no decoded dimensions yet or is cross-origin without CORS headers. */
  captureFrame(): ImageData | null {
    const { videoWidth, videoHeight } = this.video;
    if (!videoWidth || !videoHeight) return null;

    if (!this.sampleCanvas) {
      this.sampleCanvas = document.createElement('canvas');
      this.sampleCtx = this.sampleCanvas.getContext('2d', { willReadFrequently: true });
    }
    if (!this.sampleCtx) return null;

    const w = Math.min(320, videoWidth);
    const h = Math.round((w / videoWidth) * videoHeight);
    if (this.sampleCanvas.width !== w || this.sampleCanvas.height !== h) {
      this.sampleCanvas.width = w;
      this.sampleCanvas.height = h;
    }

    try {
      this.sampleCtx.drawImage(this.video, 0, 0, w, h);
      return this.sampleCtx.getImageData(0, 0, w, h);
    } catch {
      return null; // SecurityError for cross-origin video without CORS headers
    }
  }

  private sampleFrame(): void {
    if (this.frameCallbacks.size === 0) return;
    const imageData = this.captureFrame();
    if (!imageData) return;
    for (const fn of this.frameCallbacks) fn(imageData);
  }

  private syncFilter(): void {
    this.filterEl.replaceChildren(...this.pipeline.render());
    const f = this.pipeline.hasActive() ? `url(#${this.filterId})` : '';
    this.contentEl.style.filter = f;
    // Apply the same filter to the video layer so addons rendering there
    // (e.g. wasm-sharpener) also receive color/levels corrections.
    this.videoLayerEl.style.filter = f;
  }

  private initControls(): void {
    const v = this.video;
    const q = <T extends Element>(sel: string) => this.shadow.querySelector<T>(sel)!;

    const playBtn = q<HTMLButtonElement>('.play-btn');
    const muteBtn = q<HTMLButtonElement>('.mute-btn');
    const fsBtn = q<HTMLButtonElement>('.fs-btn');
    const timeEl = q<HTMLSpanElement>('.time');
    const progressEl = q<HTMLDivElement>('.progress');
    const fillEl = q<HTMLDivElement>('.progress-fill');
    const bufferEl = q<HTMLDivElement>('.progress-buffer');
    const volumeEl = q<HTMLInputElement>('.volume');

    // ── Playback ──
    const updatePlay = () => {
      playBtn.textContent = v.paused ? '▶' : '⏸';
      v.paused
        ? this.setAttribute('data-paused', '')
        : this.removeAttribute('data-paused');
    };
    v.addEventListener('play', updatePlay);
    v.addEventListener('pause', updatePlay);
    playBtn.addEventListener('click', () => { v.paused ? v.play().catch(() => {}) : v.pause(); });
    this.contentEl.addEventListener('click', () => { v.paused ? v.play().catch(() => {}) : v.pause(); });
    // Do NOT call updatePlay() here — setAttribute is banned in the constructor.

    // ── Progress ──
    const updateTime = () => {
      if (!v.duration) return;
      const pct = (v.currentTime / v.duration) * 100;
      fillEl.style.width = `${pct}%`;
      timeEl.textContent = `${formatTime(v.currentTime)} / ${formatTime(v.duration)}`;
    };
    v.addEventListener('timeupdate', updateTime);
    v.addEventListener('loadedmetadata', updateTime);

    v.addEventListener('progress', () => {
      if (!v.duration || !v.buffered.length) return;
      bufferEl.style.width = `${(v.buffered.end(v.buffered.length - 1) / v.duration) * 100}%`;
    });

    const seekTo = (clientX: number) => {
      const r = progressEl.getBoundingClientRect();
      v.currentTime = Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * v.duration;
    };

    progressEl.addEventListener('pointerdown', (e: PointerEvent) => {
      progressEl.setPointerCapture(e.pointerId);
      seekTo(e.clientX);
    });
    progressEl.addEventListener('pointermove', (e: PointerEvent) => {
      if (e.buttons) seekTo(e.clientX);
    });
    progressEl.addEventListener('click', (e: MouseEvent) => seekTo(e.clientX));

    // ── Volume ──
    const updateMuteIcon = () => {
      muteBtn.textContent = v.muted || v.volume === 0 ? '🔇' : v.volume < 0.5 ? '🔉' : '🔊';
    };
    muteBtn.addEventListener('click', () => { v.muted = !v.muted; updateMuteIcon(); });
    volumeEl.addEventListener('input', () => {
      v.volume = Number(volumeEl.value);
      v.muted = v.volume === 0;
      updateMuteIcon();
    });
    v.addEventListener('volumechange', () => {
      volumeEl.value = String(v.muted ? 0 : v.volume);
      updateMuteIcon();
    });

    // ── Fullscreen ──
    fsBtn.addEventListener('click', () => {
      document.fullscreenElement === this
        ? document.exitFullscreen()
        : this.requestFullscreen();
    });
    this.onFullscreenChange = () => {
      fsBtn.textContent = document.fullscreenElement === this ? '⤡' : '⤢';
    };
    document.addEventListener('fullscreenchange', this.onFullscreenChange);
  }
}
