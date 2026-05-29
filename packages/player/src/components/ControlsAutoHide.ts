import type { LagPlayer } from '../LagPlayer';

const HIDE_DELAY_MS = 2000;

export class ControlsAutoHide {
  private timer?: ReturnType<typeof setTimeout>;
  private cleanup?: () => void;

  init(player: LagPlayer): void {
    this.destroy();

    const v = player.videoElement;

    const scheduleHide = () => {
      clearTimeout(this.timer);
      if (!v.paused) {
        this.timer = setTimeout(() => player.hideControls(), HIDE_DELAY_MS);
      }
    };

    const onActivity = () => {
      player.showControls();
      scheduleHide();
    };

    const onPlay  = () => onActivity();
    const onPause = () => clearTimeout(this.timer);

    player.addEventListener('mousemove', onActivity);
    player.addEventListener('click',     onActivity);
    player.addEventListener('touchend',  onActivity);
    v.addEventListener('play',  onPlay);
    v.addEventListener('pause', onPause);

    this.cleanup = () => {
      player.removeEventListener('mousemove', onActivity);
      player.removeEventListener('click',     onActivity);
      player.removeEventListener('touchend',  onActivity);
      v.removeEventListener('play',  onPlay);
      v.removeEventListener('pause', onPause);
    };

    onActivity();
  }

  destroy(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.cleanup?.();
    this.cleanup = undefined;
  }
}
