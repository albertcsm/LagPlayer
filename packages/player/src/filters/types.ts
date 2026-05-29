export interface FilterConfig {
  id: string;
  type: string;
  enabled?: boolean;
  order?: number;
  params: Record<string, number>;
}

export interface FilterRenderer {
  readonly type: string;
  render(params: Record<string, number>, input: string, output: string): SVGElement[];
}
