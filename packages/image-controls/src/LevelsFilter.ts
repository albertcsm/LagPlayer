import type { FilterRenderer } from '@lagplayer/player';

// blackPoint: 0–100  input level (%) that maps to pure black  (default 0)
// whitePoint: 0–100  input level (%) that maps to pure white  (default 100)
// midtone:  -100…+100  gamma adjustment: +100 = brighter, -100 = darker (default 0)
export interface LevelsParams {
  blackPoint: number;
  whitePoint: number;
  midtone: number;
}

function svgEl(tag: string): SVGElement {
  return document.createElementNS('http://www.w3.org/2000/svg', tag);
}

function makeLinearTransfer(input: string, result: string, slope: number, intercept: number): SVGElement {
  const el = svgEl('feComponentTransfer');
  el.setAttribute('in', input);
  el.setAttribute('result', result);
  for (const ch of ['R', 'G', 'B']) {
    const f = svgEl(`feFunc${ch}`);
    f.setAttribute('type', 'linear');
    f.setAttribute('slope', slope.toFixed(5));
    f.setAttribute('intercept', intercept.toFixed(5));
    el.appendChild(f);
  }
  return el;
}

function makeGammaTransfer(input: string, result: string, exponent: number): SVGElement {
  const el = svgEl('feComponentTransfer');
  el.setAttribute('in', input);
  el.setAttribute('result', result);
  for (const ch of ['R', 'G', 'B']) {
    const f = svgEl(`feFunc${ch}`);
    f.setAttribute('type', 'gamma');
    f.setAttribute('amplitude', '1');
    f.setAttribute('exponent', exponent.toFixed(5));
    f.setAttribute('offset', '0');
    el.appendChild(f);
  }
  return el;
}

export class LevelsFilter implements FilterRenderer {
  readonly type = 'levels';

  render(params: Record<string, number>, input: string, output: string): SVGElement[] {
    const bIn = (params.blackPoint ?? 0) / 100;
    const wIn = (params.whitePoint ?? 100) / 100;
    const midtone = params.midtone ?? 0;

    const needsLinear = bIn > 1e-4 || wIn < 1 - 1e-4;
    // midtone is an integer slider; any non-zero value needs gamma
    const needsGamma = Math.abs(midtone) > 0.5;

    const elements: SVGElement[] = [];
    let currentInput = input;

    if (needsLinear) {
      const range = Math.max(wIn - bIn, 0.001); // guard against white <= black
      const slope = 1 / range;
      const intercept = -bIn / range;
      const linearResult = needsGamma ? `${output}-lv` : output;
      elements.push(makeLinearTransfer(currentInput, linearResult, slope, intercept));
      currentInput = linearResult;
    }

    if (needsGamma) {
      // exponent 2^(-midtone/100): midtone=-100 → 2 (dark), 0 → 1 (neutral), +100 → 0.5 (bright)
      const exponent = Math.pow(2, -midtone / 100);
      elements.push(makeGammaTransfer(currentInput, output, exponent));
    }

    // Fallback: if somehow called with all-default params, emit identity passthrough
    if (elements.length === 0) {
      const id = svgEl('feComponentTransfer');
      id.setAttribute('in', input);
      id.setAttribute('result', output);
      elements.push(id);
    }

    return elements;
  }
}
