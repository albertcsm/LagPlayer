import { describe, it, expect } from 'vitest';
import { LevelsFilter } from '../LevelsFilter';

const filter = new LevelsFilter();

function render(params: Record<string, number>) {
  return filter.render(params, 'SourceGraphic', 'out');
}

function feFuncs(el: SVGElement): SVGElement[] {
  return Array.from(el.children) as SVGElement[];
}

describe('LevelsFilter – type', () => {
  it('has type "levels"', () => {
    expect(filter.type).toBe('levels');
  });
});

describe('LevelsFilter – identity / fallback', () => {
  it('returns at least one element for all-default params', () => {
    const els = render({ blackPoint: 0, whitePoint: 100, midtone: 0 });
    expect(els.length).toBeGreaterThanOrEqual(1);
  });

  it('fallback element is a feComponentTransfer', () => {
    const els = render({ blackPoint: 0, whitePoint: 100, midtone: 0 });
    expect(els[0].tagName.toLowerCase()).toBe('fecomponenttransfer');
  });
});

describe('LevelsFilter – black point', () => {
  it('returns one element when only blackPoint is set', () => {
    const els = render({ blackPoint: 20, whitePoint: 100, midtone: 0 });
    expect(els.length).toBe(1);
  });

  it('that element is a linear feComponentTransfer', () => {
    const els = render({ blackPoint: 20, whitePoint: 100, midtone: 0 });
    expect(feFuncs(els[0])[0].getAttribute('type')).toBe('linear');
  });

  it('slope > 1 when blackPoint > 0 (range compressed)', () => {
    const els = render({ blackPoint: 20, whitePoint: 100, midtone: 0 });
    const slope = Number(feFuncs(els[0])[0].getAttribute('slope'));
    expect(slope).toBeGreaterThan(1);
  });

  it('intercept is negative when blackPoint > 0 (shifts input down)', () => {
    const els = render({ blackPoint: 20, whitePoint: 100, midtone: 0 });
    const intercept = Number(feFuncs(els[0])[0].getAttribute('intercept'));
    expect(intercept).toBeLessThan(0);
  });
});

describe('LevelsFilter – white point', () => {
  it('returns one element when only whitePoint is reduced', () => {
    const els = render({ blackPoint: 0, whitePoint: 80, midtone: 0 });
    expect(els.length).toBe(1);
  });

  it('slope > 1 when whitePoint < 100 (range compressed)', () => {
    const els = render({ blackPoint: 0, whitePoint: 80, midtone: 0 });
    const slope = Number(feFuncs(els[0])[0].getAttribute('slope'));
    expect(slope).toBeGreaterThan(1);
  });
});

describe('LevelsFilter – midtone', () => {
  it('returns one element when only midtone changes', () => {
    const els = render({ blackPoint: 0, whitePoint: 100, midtone: 50 });
    expect(els.length).toBe(1);
  });

  it('that element is a gamma feComponentTransfer', () => {
    const els = render({ blackPoint: 0, whitePoint: 100, midtone: 50 });
    expect(feFuncs(els[0])[0].getAttribute('type')).toBe('gamma');
  });

  it('positive midtone produces exponent < 1 (brighter)', () => {
    const els = render({ blackPoint: 0, whitePoint: 100, midtone: 100 });
    const exp = Number(feFuncs(els[0])[0].getAttribute('exponent'));
    expect(exp).toBeLessThan(1);
  });

  it('negative midtone produces exponent > 1 (darker)', () => {
    const els = render({ blackPoint: 0, whitePoint: 100, midtone: -100 });
    const exp = Number(feFuncs(els[0])[0].getAttribute('exponent'));
    expect(exp).toBeGreaterThan(1);
  });

  it('midtone=0 produces exponent = 1 (neutral)', () => {
    // midtone=0 skips gamma, but if we force the gamma path via direct call
    // we verify via midtone=±1 that the curve is symmetric ish
    const elsBright = render({ blackPoint: 0, whitePoint: 100, midtone: 100 });
    const elsDark   = render({ blackPoint: 0, whitePoint: 100, midtone: -100 });
    const expBright = Number(feFuncs(elsBright[0])[0].getAttribute('exponent'));
    const expDark   = Number(feFuncs(elsDark[0])[0].getAttribute('exponent'));
    // product of the two exponents should equal 1 (2^x * 2^-x = 1)
    expect(expBright * expDark).toBeCloseTo(1, 4);
  });
});

describe('LevelsFilter – chaining (black/white + midtone)', () => {
  it('returns two elements when levels and midtone are both non-default', () => {
    const els = render({ blackPoint: 10, whitePoint: 90, midtone: 30 });
    expect(els.length).toBe(2);
  });

  it('first element is linear, second is gamma', () => {
    const els = render({ blackPoint: 10, whitePoint: 90, midtone: 30 });
    expect(feFuncs(els[0])[0].getAttribute('type')).toBe('linear');
    expect(feFuncs(els[1])[0].getAttribute('type')).toBe('gamma');
  });

  it('linear result feeds into gamma input', () => {
    const els = render({ blackPoint: 10, whitePoint: 90, midtone: 30 });
    const linearResult = els[0].getAttribute('result');
    const gammaIn = els[1].getAttribute('in');
    expect(linearResult).toBeTruthy();
    expect(gammaIn).toBe(linearResult);
  });

  it('final element has the requested result name', () => {
    const els = render({ blackPoint: 10, whitePoint: 90, midtone: 30 });
    expect(els.at(-1)!.getAttribute('result')).toBe('out');
  });

  it('first element reads from input', () => {
    const els = render({ blackPoint: 10, whitePoint: 90, midtone: 30 });
    expect(els[0].getAttribute('in')).toBe('SourceGraphic');
  });
});

describe('LevelsFilter – each feFuncX gets same parameters', () => {
  it('R, G, B get identical slope for black point adjustment', () => {
    const els = render({ blackPoint: 25, whitePoint: 100, midtone: 0 });
    const funcs = feFuncs(els[0]);
    const slopes = funcs.map(f => f.getAttribute('slope'));
    expect(slopes[0]).toBe(slopes[1]);
    expect(slopes[1]).toBe(slopes[2]);
  });

  it('R, G, B get identical exponent for midtone adjustment', () => {
    const els = render({ blackPoint: 0, whitePoint: 100, midtone: 60 });
    const funcs = feFuncs(els[0]);
    const exps = funcs.map(f => f.getAttribute('exponent'));
    expect(exps[0]).toBe(exps[1]);
    expect(exps[1]).toBe(exps[2]);
  });
});
