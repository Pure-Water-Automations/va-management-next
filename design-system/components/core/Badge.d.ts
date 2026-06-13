import { CSSProperties, ReactNode } from 'react';

/**
 * PWA status chip for system states, sensor readings, and categorical labels.
 * Semantic variants map directly to system health (success=online, danger=fault, warning=caution).
 */
export interface BadgeProps {
  variant?: 'default' | 'primary' | 'sky' | 'success' | 'warning' | 'danger' | 'info' | 'solid' | 'solid-sky' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  /** Show a status dot */
  dot?: boolean;
  /** Animate the dot — use for live/active system status */
  pulse?: boolean;
  children?: ReactNode;
  style?: CSSProperties;
}

export declare function Badge(props: BadgeProps): JSX.Element;
