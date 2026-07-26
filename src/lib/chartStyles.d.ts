/** Minimal typing for the copied Chart.js styling kit (window.ChartStyles). */
export interface ChartStylesApi {
  THEME: {
    palette: string[];
    accent: string;
    reference: string;
    axisColor: string;
    gridColor: string;
    tooltipBg: string;
    fontFamily: string;
  };
  color: (i: number) => string;
  hexToRgba: (hex: string, a: number) => string;
  applyGlobalDefaults: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tooltip: (opts?: any) => any;
  niceRange: (vals: number[], pad: number) => { min?: number; max?: number };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  referenceLinePlugin: (getRatio: () => number | null) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lineChart: (ctx: CanvasRenderingContext2D, cfg: any) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  scatterChart: (ctx: CanvasRenderingContext2D, cfg: any) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  barChart: (ctx: CanvasRenderingContext2D, cfg: any) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bubbleChart: (ctx: CanvasRenderingContext2D, cfg: any) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  renderLegend: (container: HTMLElement, items: any[]) => void;
  radiusFromValue: (v: number, divisor?: number, min?: number) => number;
  format: {
    millions: (dp?: number) => (v: number) => string;
    thousands: (dp?: number) => (v: number) => string;
    money: (v: number) => string;
    integer: (v: number) => string;
    percent: (dp?: number) => (v: number) => string;
  };
}

declare const ChartStyles: ChartStylesApi;
export default ChartStyles;
