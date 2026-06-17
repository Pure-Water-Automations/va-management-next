import { CSSProperties, ReactNode } from 'react';

/**
 * PWA KPI metric card — the core dashboard building block.
 * Shows a label, large numeric value, optional unit, and trend indicator.
 * Use in a grid to build monitoring dashboards.
 *
 * @startingPoint section="Components" subtitle="KPI metric card with trend indicator" viewport="700x280"
 */
export interface StatProps {
  /** Metric label, e.g. "Flow Rate" */
  label: string;
  /** The numeric or text value, e.g. "12.4" or "98%" */
  value: string | number;
  /** Unit label, e.g. "L/min" or "ppm" */
  unit?: string;
  /** Change value, e.g. "+2.1%" */
  change?: string;
  /** Context for change, e.g. "vs. last 24h" */
  changeLabel?: string;
  /** Direction of change — sets trend badge color */
  trend?: 'up' | 'down' | 'neutral';
  /** Icon node (24×24 SVG recommended) */
  icon?: ReactNode;
  variant?: 'default' | 'navy' | 'sky';
  style?: CSSProperties;
}

export declare function Stat(props: StatProps): JSX.Element;
