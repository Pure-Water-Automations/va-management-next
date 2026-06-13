import { CSSProperties, ReactNode, ChangeEvent } from 'react';

/**
 * PWA text input with label, validation, and icon slots.
 * Pass SVG path `<path>` elements as `icon` / `iconRight` props —
 * they are wrapped in a 24×24 `<svg viewBox="0 0 24 24">` automatically.
 *
 * @startingPoint section="Components" subtitle="Text input with label, icon, error states" viewport="700x280"
 */
export interface InputProps {
  label?: string;
  hint?: string;
  /** Red error text; also sets red border */
  error?: string;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  /** SVG path nodes for leading icon */
  icon?: ReactNode;
  /** SVG path nodes for trailing icon */
  iconRight?: ReactNode;
  type?: string;
  placeholder?: string;
  value?: string;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  id?: string;
  style?: CSSProperties;
  containerStyle?: CSSProperties;
}

export declare function Input(props: InputProps): JSX.Element;
