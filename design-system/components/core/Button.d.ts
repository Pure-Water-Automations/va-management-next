import { CSSProperties, MouseEvent, ReactNode } from 'react';

/**
 * PWA primary interactive control.
 * Use `primary` for the most important action, `secondary` for sky-blue CTAs,
 * `ghost` for low-emphasis actions, and `danger` for destructive actions.
 *
 * @startingPoint section="Components" subtitle="Pill button — 6 variants, 5 sizes" viewport="700x280"
 */
export interface ButtonProps {
  /** Visual treatment */
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline' | 'outline-sky' | 'danger' | 'text';
  /** Height / padding scale */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  /** Renders spinner; disables click */
  loading?: boolean;
  disabled?: boolean;
  /** Stretches to full container width */
  fullWidth?: boolean;
  /** Leading icon node (any SVG / React element) */
  icon?: ReactNode;
  /** Trailing icon node */
  iconRight?: ReactNode;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  type?: 'button' | 'submit' | 'reset';
  /** Renders as <a> when set */
  href?: string;
  children?: ReactNode;
  style?: CSSProperties;
}

export declare function Button(props: ButtonProps): JSX.Element;
