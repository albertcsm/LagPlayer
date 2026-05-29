import type { LagPlayer } from '../LagPlayer';
import css from './PlaybackSpeed.css?raw';
import html from './PlaybackSpeed.html?raw';

function fmtRate(rate: number): string {
  return `${rate}×`;
}

export class PlaybackSpeed {
  private visible = false;
  private controlBtn: HTMLButtonElement | null = null;
  private unregisterBtn?: () => void;
  private unregisterOverlay?: () => void;

  init(player: LagPlayer): void {
    this.destroy();

    const panel = document.createElement('lag-speed-panel') as HTMLElement;
    panel.attachShadow({ mode: 'open' }).innerHTML = `<style>${css}</style>${html}`;
    this.unregisterOverlay = player.registerOverlay(panel);

    const v = player.videoElement;
    const presets = Array.from(
      panel.shadowRoot!.querySelectorAll<HTMLButtonElement>('.preset'),
    );

    const syncActive = (rate: number) => {
      presets.forEach(p => p.classList.toggle('active', Number(p.dataset.rate) === rate));
    };

    const closePanel = () => {
      this.visible = false;
      panel.classList.remove('visible');
      this.controlBtn?.removeAttribute('data-active');
    };

    presets.forEach(preset => {
      preset.addEventListener('click', () => {
        const rate = Number(preset.dataset.rate);
        v.playbackRate = rate;
        syncActive(rate);
        if (this.controlBtn) this.controlBtn.textContent = fmtRate(rate);
        closePanel();
      });
    });

    // Reflect any external playbackRate change (e.g. keyboard shortcut, other code)
    v.addEventListener('ratechange', () => {
      syncActive(v.playbackRate);
      if (this.controlBtn) this.controlBtn.textContent = fmtRate(v.playbackRate);
    });

    this.unregisterBtn = player.registerControlButton({
      icon: fmtRate(v.playbackRate || 1),
      title: 'Playback speed',
      onClick: (btn) => {
        this.controlBtn = btn;
        this.visible = !this.visible;
        panel.classList.toggle('visible', this.visible);
        btn.toggleAttribute('data-active', this.visible);
      },
    });
  }

  destroy(): void {
    this.unregisterBtn?.();
    this.unregisterOverlay?.();
    this.unregisterBtn = undefined;
    this.unregisterOverlay = undefined;
    this.controlBtn = null;
    this.visible = false;
  }
}
