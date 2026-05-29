export type { ColorCorrectionParams } from './ColorCorrectionFilter';
export type { LevelsParams } from './LevelsFilter';
export { ColorCorrectionFilter } from './ColorCorrectionFilter';
export { LevelsFilter } from './LevelsFilter';
export { LagImageControls } from './ImageControls';

import { LagImageControls } from './ImageControls';

if (typeof customElements !== 'undefined') {
  if (!customElements.get('lag-image-controls')) {
    customElements.define('lag-image-controls', LagImageControls);
  }
}
