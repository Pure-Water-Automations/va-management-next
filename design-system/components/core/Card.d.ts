import { CSSProperties, MouseEvent, ReactNode } from 'react';

/**
 * PWA content container.
 * Default is white + border + shadow-sm. Use `elevated` for floating panels,
 * `glass` for overlays, `navy` for dark hero cards, `flat` for subtle grouping.
 *
 * @startingPoint section="Components" subtitle="Content card — 7 variants" viewport="700x320"
 */
export interface CardProps {
  /** Visual treatment */
  variant?: 'default' | 'elevated' | 'glass' | 'navy' | 'sky' | 'flat' | 'outline';
  /** Internal padding */
  padding?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  /** Corner radius preset */
  radius?: 'sm' | 'md' | 'card' | 'lg';
  /** Adds hover lift even without onClick */
  hoverable?: boolean;
  onClick?: (e: MouseEvent<HTMLDivElement>) => void;
  children?: ReactNode;
  style?: CSSProperties;
}

export declare function Card(props: CardProps): JSX.Element;
