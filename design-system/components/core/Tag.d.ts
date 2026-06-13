import { CSSProperties, ReactNode } from 'react';

/**
 * PWA category / filter label with optional remove button.
 * Rectangular (unlike Badge pill) — use for taxonomy, filters, and selected options.
 */
export interface TagProps {
  variant?: 'default' | 'primary' | 'sky' | 'success' | 'warning' | 'danger' | 'outline' | 'solid';
  size?: 'sm' | 'md' | 'lg';
  /** Shows × remove button */
  removable?: boolean;
  /** Called when × is clicked */
  onRemove?: () => void;
  children?: ReactNode;
  style?: CSSProperties;
}

export declare function Tag(props: TagProps): JSX.Element;
