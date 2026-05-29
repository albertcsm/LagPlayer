import type { FilterRenderer } from '@lagplayer/player';

// temperature: -100 (cool/blue)    to +100 (warm/orange)
// tint:        -100 (green)         to +100 (magenta)
// saturation:  -100 (grayscale)     to +100 (oversaturated)
export interface ColorCorrectionParams {
  temperature: number;
  tint: number;
  saturation: number;
}

export class ColorCorrectionFilter implements FilterRenderer {
  readonly type = 'colorCorrection';

  render(params: Record<string, number>, input: string, output: string): SVGElement[] {
    const t = (params.temperature ?? 0) / 100; // [-1, 1]
    const m = (params.tint ?? 0) / 100;         // [-1, 1]
    // Map [-100, +100] → [0, 2]: 0 = grayscale, 1 = unchanged, 2 = double saturation.
    const satValue = Math.max(0, 1 + (params.saturation ?? 0) / 100);
    const hasSat = Math.abs(satValue - 1) > 1e-4;

    const rScale = 1 + 0.4 * t;
    const gScale = (1 - 0.05 * Math.abs(t)) * (1 - 0.3 * m);
    const bScale = 1 - 0.4 * t;

    // feColorMatrix type="matrix" is a 4×5 row-major matrix applied to [R, G, B, A, 1].
    const matrixValues = [
      rScale, 0,      0,      0, 0,
      0,      gScale, 0,      0, 0,
      0,      0,      bScale, 0, 0,
      0,      0,      0,      1, 0,
    ].map((v) => v.toFixed(5)).join(' ');

    // When saturation needs a second primitive, chain via an intermediate result name.
    const matrixResult = hasSat ? `${output}-cc` : output;

    const matrixEl = document.createElementNS('http://www.w3.org/2000/svg', 'feColorMatrix');
    matrixEl.setAttribute('type', 'matrix');
    matrixEl.setAttribute('values', matrixValues);
    matrixEl.setAttribute('in', input);
    matrixEl.setAttribute('result', matrixResult);

    if (!hasSat) return [matrixEl];

    // feColorMatrix type="saturate" accepts a single [0, ∞) multiplier.
    const satEl = document.createElementNS('http://www.w3.org/2000/svg', 'feColorMatrix');
    satEl.setAttribute('type', 'saturate');
    satEl.setAttribute('values', satValue.toFixed(4));
    satEl.setAttribute('in', matrixResult);
    satEl.setAttribute('result', output);

    return [matrixEl, satEl];
  }
}
