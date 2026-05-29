import { describe, it, expect } from 'vitest';
import { ColorCorrectionFilter } from '../ColorCorrectionFilter';

function matrixValues(el: SVGElement): number[] {
  return el.getAttribute('values')!.split(' ').map(Number);
}

describe('ColorCorrectionFilter', () => {
  const filter = new ColorCorrectionFilter();

  it('produces an identity-like matrix at temperature=0, tint=0, saturation=0', () => {
    const [el] = filter.render({ temperature: 0, tint: 0, saturation: 0 }, 'SourceGraphic', 'result');
    const v = matrixValues(el);
    expect(v[0]).toBeCloseTo(1);   // R scale
    expect(v[6]).toBeCloseTo(1);   // G scale
    expect(v[12]).toBeCloseTo(1);  // B scale
    expect(v[18]).toBeCloseTo(1);  // A scale
    expect(v[4]).toBeCloseTo(0);   // no offset
    expect(v[9]).toBeCloseTo(0);
    expect(v[14]).toBeCloseTo(0);
  });

  it('warm temperature boosts R and cuts B', () => {
    const [el] = filter.render({ temperature: 100, tint: 0, saturation: 0 }, 'SourceGraphic', 'result');
    const v = matrixValues(el);
    expect(v[0]).toBeGreaterThan(1);   // R > 1
    expect(v[12]).toBeLessThan(1);     // B < 1
  });

  it('cool temperature cuts R and boosts B', () => {
    const [el] = filter.render({ temperature: -100, tint: 0, saturation: 0 }, 'SourceGraphic', 'result');
    const v = matrixValues(el);
    expect(v[0]).toBeLessThan(1);
    expect(v[12]).toBeGreaterThan(1);
  });

  it('magenta tint reduces G', () => {
    const [el] = filter.render({ temperature: 0, tint: 100, saturation: 0 }, 'SourceGraphic', 'result');
    expect(matrixValues(el)[6]).toBeLessThan(1);
  });

  it('green tint boosts G', () => {
    const [el] = filter.render({ temperature: 0, tint: -100, saturation: 0 }, 'SourceGraphic', 'result');
    expect(matrixValues(el)[6]).toBeGreaterThan(1);
  });

  describe('saturation', () => {
    it('returns one element when saturation=0 (no chaining needed)', () => {
      const els = filter.render({ temperature: 0, tint: 0, saturation: 0 }, 'SourceGraphic', 'result');
      expect(els).toHaveLength(1);
    });

    it('returns two elements when saturation is non-zero', () => {
      const els = filter.render({ temperature: 0, tint: 0, saturation: 50 }, 'SourceGraphic', 'result');
      expect(els).toHaveLength(2);
    });

    it('second element is feColorMatrix type=saturate', () => {
      const [, satEl] = filter.render({ temperature: 0, tint: 0, saturation: 50 }, 'SourceGraphic', 'result');
      expect(satEl.getAttribute('type')).toBe('saturate');
    });

    it('saturation=+100 produces saturate value > 1', () => {
      const [, satEl] = filter.render({ temperature: 0, tint: 0, saturation: 100 }, 'SourceGraphic', 'result');
      expect(Number(satEl.getAttribute('values'))).toBeGreaterThan(1);
    });

    it('saturation=-100 produces saturate value = 0 (grayscale)', () => {
      const [, satEl] = filter.render({ temperature: 0, tint: 0, saturation: -100 }, 'SourceGraphic', 'result');
      expect(Number(satEl.getAttribute('values'))).toBeCloseTo(0);
    });

    it('chains matrix result into saturate input', () => {
      const [matEl, satEl] = filter.render({ temperature: 0, tint: 0, saturation: 50 }, 'SourceGraphic', 'result');
      expect(satEl.getAttribute('in')).toBe(matEl.getAttribute('result'));
    });

    it('final element always has the requested result name', () => {
      const elsNoSat = filter.render({ temperature: 0, tint: 0, saturation: 0 }, 'SourceGraphic', 'out');
      expect(elsNoSat.at(-1)!.getAttribute('result')).toBe('out');

      const elsWithSat = filter.render({ temperature: 0, tint: 0, saturation: 50 }, 'SourceGraphic', 'out');
      expect(elsWithSat.at(-1)!.getAttribute('result')).toBe('out');
    });
  });

  it('sets in and result attributes on the element', () => {
    const [el] = filter.render({ temperature: 0, tint: 0, saturation: 0 }, 'SourceGraphic', 'out');
    expect(el.getAttribute('in')).toBe('SourceGraphic');
    expect(el.getAttribute('result')).toBe('out');
  });
});
