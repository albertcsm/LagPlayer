import type { LagPlayer } from '../LagPlayer';
import css from './MediaInfo.css?raw';
import html from './MediaInfo.html?raw';

export class MediaInfo {
  private panel: HTMLElement | null = null;
  private visible = false;
  private unregisterBtn?: () => void;
  private unregisterOverlay?: () => void;

  private renderFpsHandle?: number;
  private renderFpsCount = 0;
  private renderFpsLastTs = 0;

  private vfcHandle?: number;
  private vfcPrevFrames = 0;
  private vfcPrevTs = 0;

  init(player: LagPlayer): void {
    this.destroy();

    // Panel is a custom element with its own shadow DOM for style encapsulation
    const panel = document.createElement('lag-media-info-panel') as HTMLElement;
    panel.attachShadow({ mode: 'open' }).innerHTML = `<style>${css}</style>${html}`;
    this.panel = panel;
    this.unregisterOverlay = player.registerOverlay(panel);

    const field = (name: string) =>
      panel.shadowRoot!.querySelector<HTMLSpanElement>(`[data-field="${name}"]`)!;

    const elResolution = field('resolution');
    const elFramerate  = field('framerate');
    const elRenderfps  = field('renderfps');
    const elDropped    = field('dropped');

    const v = player.videoElement;

    const updateResolution = () => {
      elResolution.textContent = v.videoWidth && v.videoHeight
        ? `${v.videoWidth}×${v.videoHeight}`
        : '—';
    };
    v.addEventListener('loadedmetadata', updateResolution);

    this.unregisterBtn = player.registerControlButton({
      icon: 'ⓘ',
      title: 'Media info',
      onClick: (btn) => {
        this.visible = !this.visible;
        panel.classList.toggle('visible', this.visible);
        btn.toggleAttribute('data-active', this.visible);

        if (this.visible) {
          updateResolution();
          this.startRenderFps(elRenderfps);
          this.startVideoFps(elFramerate, elDropped, v);
        } else {
          this.stopRenderFps(elRenderfps);
          this.stopVideoFps(elFramerate, elDropped, v);
        }
      },
    });

    v.addEventListener('play', () => {
      if (!this.visible) return;
      this.startRenderFps(elRenderfps);
      this.startVideoFps(elFramerate, elDropped, v);
    });
    v.addEventListener('pause', () => {
      this.stopRenderFps(elRenderfps);
      this.stopVideoFps(elFramerate, elDropped, v);
    });
  }

  destroy(): void {
    this.stopRenderFps();
    this.stopVideoFps();
    this.unregisterBtn?.();
    this.unregisterOverlay?.();
    this.unregisterBtn = undefined;
    this.unregisterOverlay = undefined;
    this.panel = null;
    this.visible = false;
  }

  private startRenderFps(el?: HTMLSpanElement): void {
    this.stopRenderFps();
    this.renderFpsCount = 0;
    this.renderFpsLastTs = 0;
    const tick = (ts: number) => {
      if (this.renderFpsLastTs === 0) {
        this.renderFpsLastTs = ts;
      } else {
        this.renderFpsCount++;
        const elapsed = ts - this.renderFpsLastTs;
        if (elapsed >= 1000) {
          if (el) el.textContent = `${((this.renderFpsCount / elapsed) * 1000).toFixed(1)} fps`;
          this.renderFpsCount = 0;
          this.renderFpsLastTs = ts;
        }
      }
      this.renderFpsHandle = requestAnimationFrame(tick);
    };
    this.renderFpsHandle = requestAnimationFrame(tick);
  }

  private stopRenderFps(el?: HTMLSpanElement): void {
    if (this.renderFpsHandle !== undefined) {
      cancelAnimationFrame(this.renderFpsHandle);
      this.renderFpsHandle = undefined;
    }
    this.renderFpsLastTs = 0;
    this.renderFpsCount = 0;
    if (el) el.textContent = '—';
  }

  private startVideoFps(
    elFps?: HTMLSpanElement,
    elDropped?: HTMLSpanElement,
    v?: HTMLVideoElement,
  ): void {
    this.stopVideoFps(undefined, undefined, v);
    if (!v || !('requestVideoFrameCallback' in v)) {
      if (elFps) elFps.textContent = 'N/A';
      return;
    }
    this.vfcPrevFrames = 0;
    this.vfcPrevTs = 0;

    const tick = (_now: number, meta: VideoFrameCallbackMetadata) => {
      const ts = performance.now();
      if (this.vfcPrevTs === 0) {
        this.vfcPrevTs = ts;
        this.vfcPrevFrames = meta.presentedFrames;
      } else {
        const elapsed = ts - this.vfcPrevTs;
        if (elapsed >= 1000) {
          const frames = meta.presentedFrames - this.vfcPrevFrames;
          if (elFps) elFps.textContent = `${((frames / elapsed) * 1000).toFixed(1)} fps`;
          this.vfcPrevTs = ts;
          this.vfcPrevFrames = meta.presentedFrames;
        }
      }
      if (elDropped && 'getVideoPlaybackQuality' in v) {
        elDropped.textContent = String(v.getVideoPlaybackQuality().droppedVideoFrames);
      }
      this.vfcHandle = v.requestVideoFrameCallback(tick);
    };
    this.vfcHandle = v.requestVideoFrameCallback(tick);
  }

  private stopVideoFps(
    elFps?: HTMLSpanElement,
    elDropped?: HTMLSpanElement,
    v?: HTMLVideoElement,
  ): void {
    if (this.vfcHandle !== undefined && v) {
      v.cancelVideoFrameCallback(this.vfcHandle);
      this.vfcHandle = undefined;
    }
    this.vfcPrevTs = 0;
    this.vfcPrevFrames = 0;
    if (elFps) elFps.textContent = '—';
    if (elDropped) elDropped.textContent = '—';
  }
}
