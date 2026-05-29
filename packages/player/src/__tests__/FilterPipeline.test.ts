import { describe, it, expect, beforeEach } from 'vitest';
import type { FilterRenderer } from '../filters/types';
import { FilterPipeline } from '../filters/FilterPipeline';

const stubRenderer: FilterRenderer = {
  type: 'colorCorrection',
  render(_params, input, output) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'feColorMatrix');
    el.setAttribute('in', input);
    el.setAttribute('result', output);
    return [el];
  },
};

describe('FilterPipeline', () => {
  let pipeline: FilterPipeline;

  beforeEach(() => {
    pipeline = new FilterPipeline();
    pipeline.registerRenderer(stubRenderer);
  });

  it('starts with no active filters', () => {
    expect(pipeline.hasActive()).toBe(false);
    expect(pipeline.render()).toHaveLength(0);
  });

  it('becomes active after a filter is set', () => {
    pipeline.set({ id: 'cc', type: 'colorCorrection', params: { temperature: 50, tint: 0 } });
    expect(pipeline.hasActive()).toBe(true);
  });

  it('render() returns SVG elements for an active filter', () => {
    pipeline.set({ id: 'cc', type: 'colorCorrection', params: { temperature: 0, tint: 0 } });
    const els = pipeline.render();
    expect(els.length).toBeGreaterThan(0);
    expect(els[0].tagName.toLowerCase()).toBe('fecolormatrix');
  });

  it('first primitive reads from SourceGraphic', () => {
    pipeline.set({ id: 'cc', type: 'colorCorrection', params: { temperature: 0, tint: 0 } });
    expect(pipeline.render()[0].getAttribute('in')).toBe('SourceGraphic');
  });

  it('removing a filter deactivates the pipeline', () => {
    pipeline.set({ id: 'cc', type: 'colorCorrection', params: { temperature: 50, tint: 0 } });
    pipeline.remove('cc');
    expect(pipeline.hasActive()).toBe(false);
    expect(pipeline.render()).toHaveLength(0);
  });

  it('respects the enabled flag', () => {
    pipeline.set({ id: 'cc', type: 'colorCorrection', enabled: false, params: { temperature: 50, tint: 0 } });
    expect(pipeline.hasActive()).toBe(false);
  });

  it('chains multiple filters via in/result', () => {
    pipeline.set({ id: 'a', type: 'colorCorrection', params: { temperature: 50, tint: 0 } });
    pipeline.set({ id: 'b', type: 'colorCorrection', params: { temperature: 0, tint: 30 } });
    const els = pipeline.render();
    expect(els).toHaveLength(2);
    // Second primitive's `in` must match first primitive's `result`
    expect(els[1].getAttribute('in')).toBe(els[0].getAttribute('result'));
  });
});
