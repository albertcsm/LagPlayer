export type { FilterConfig, FilterRenderer } from './filters/types';
export type { ControlButtonConfig } from './LagPlayer';
export { FilterPipeline } from './filters/FilterPipeline';
export { LagPlayer } from './LagPlayer';

import { LagPlayer } from './LagPlayer';

if (typeof customElements !== 'undefined') {
  if (!customElements.get('lag-player')) {
    customElements.define('lag-player', LagPlayer);
  }
}
