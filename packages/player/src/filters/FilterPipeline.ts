import type { FilterConfig, FilterRenderer } from './types';

export class FilterPipeline {
  private readonly renderers: Map<string, FilterRenderer> = new Map();
  private filters: Map<string, FilterConfig> = new Map();

  registerRenderer(renderer: FilterRenderer): void {
    this.renderers.set(renderer.type, renderer);
  }

  set(config: FilterConfig): void {
    this.filters.set(config.id, config);
  }

  remove(id: string): void {
    this.filters.delete(id);
  }

  hasActive(): boolean {
    return Array.from(this.filters.values()).some((f) => f.enabled !== false);
  }

  // Returns SVG primitive elements chained in pipeline order.
  render(): SVGElement[] {
    const active = Array.from(this.filters.values())
      .filter((f) => f.enabled !== false)
      .sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER));
    if (active.length === 0) return [];

    const elements: SVGElement[] = [];
    let input = 'SourceGraphic';

    for (let i = 0; i < active.length; i++) {
      const filter = active[i];
      const renderer = this.renderers.get(filter.type);
      if (!renderer) continue;

      const output = i === active.length - 1 ? 'result' : `step${i}`;
      elements.push(...renderer.render(filter.params, input, output));
      input = output;
    }

    return elements;
  }
}
