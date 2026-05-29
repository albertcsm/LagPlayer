import type { LagPlayer } from '@lagplayer/player';
import { WasmPipeline } from './WasmPipeline.js';
import wasmUrl from '../assembly/build/release.wasm?url';
import css from './WasmSharpener.css?raw';
import html from './WasmSharpener.html?raw';

export class WasmSharpener {
  private player: LagPlayer | null = null;
  private pipeline: WasmPipeline | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private panel: HTMLDivElement | null = null;

  private removeLayer?: () => void;
  private removeOverlay?: () => void;
  private removeBtn?: () => void;
  private frameHandle?: number;

  private enabled = true;
  private amount  = 1.0;

  async init(player: LagPlayer): Promise<void> {
    this.destroy();
    this.player = player;

    // WebGL canvas sits in the video layer (z-index 15: above video, below controls).
    const canvas = document.createElement('canvas');
    Object.assign(canvas.style, {
      position: 'absolute', inset: '0',
      width: '100%', height: '100%',
      pointerEvents: 'none',
    });
    this.canvas = canvas;
    this.removeLayer = player.registerVideoLayer(canvas);

    this.pipeline = await WasmPipeline.create(canvas, wasmUrl);

    this.startFrameLoop();

    // Settings panel registered as a UI overlay (above controls, pointer-events enabled).
    const { panel, removeOverlay } = this.buildPanel(player);
    this.panel = panel;
    this.removeOverlay = removeOverlay;

    this.removeBtn = player.registerControlButton({
      icon: '◈',
      title: 'Sharpen',
      onClick: (btn) => {
        const opening = panel.style.display === 'none';
        panel.style.display = opening ? 'block' : 'none';
        if (opening) btn.dataset.active = ''; else delete btn.dataset.active;
      },
    });
  }

  destroy(): void {
    this.stopFrameLoop();
    this.removeBtn?.();
    this.removeOverlay?.();
    this.removeLayer?.();
    this.pipeline?.destroy();
    this.pipeline = null;
    this.removeBtn = undefined;
    this.removeOverlay = undefined;
    this.removeLayer = undefined;
    this.player = null;
  }

  private startFrameLoop(): void {
    const video = this.player?.videoElement;
    if (!video) return;

    const useRVFC = 'requestVideoFrameCallback' in video;
    const tick = () => {
      if (!this.player) return;
      if (this.enabled && this.pipeline) {
        this.pipeline.processFrame(this.player.videoElement, this.amount);
      }
      if (!this.player) return;
      if (useRVFC) {
        this.frameHandle = (this.player.videoElement as any).requestVideoFrameCallback(tick);
      } else {
        this.frameHandle = requestAnimationFrame(tick);
      }
    };

    this.frameHandle = useRVFC
      ? (video as any).requestVideoFrameCallback(tick)
      : requestAnimationFrame(tick);
  }

  private stopFrameLoop(): void {
    if (this.frameHandle === undefined) return;
    const video = this.player?.videoElement;
    if (video && 'cancelVideoFrameCallback' in video) {
      (video as any).cancelVideoFrameCallback(this.frameHandle);
    } else {
      cancelAnimationFrame(this.frameHandle);
    }
    this.frameHandle = undefined;
  }

  private setEnabled(v: boolean): void {
    this.enabled = v;
    if (!v) this.pipeline?.clear();
  }

  private buildPanel(player: LagPlayer): { panel: HTMLDivElement; removeOverlay: () => void } {
    const panel = document.createElement('div');
    panel.style.display = 'none';
    panel.attachShadow({ mode: 'open' }).innerHTML = `<style>${css}</style>${html}`;

    const root   = panel.shadowRoot!;
    const toggle = root.querySelector<HTMLInputElement>('.s-enable')!;
    const slider = root.querySelector<HTMLInputElement>('.s-amount')!;
    const valEl  = root.querySelector<HTMLSpanElement>('.s-val')!;

    toggle.addEventListener('change', () => this.setEnabled(toggle.checked));
    slider.addEventListener('input', () => {
      this.amount = Number(slider.value);
      valEl.textContent = this.amount.toFixed(2);
    });

    const removeOverlay = player.registerOverlay(panel);
    return { panel, removeOverlay };
  }
}
