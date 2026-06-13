import { CSSProperties } from 'react';

/**
 * PWA toggle switch for automation on/off controls, settings, and feature flags.
 * Spring-animated thumb. Sky-blue when active — matches the brand accent.
 *
 * @startingPoint section="Components" subtitle="Toggle switch for automation controls" viewport="700x200"
 */
export interface SwitchProps {
  checked?: boolean;
  /** Called with new boolean value */
  onChange?: (value: boolean) => void;
  disabled?: boolean;
  label?: string;
  hint?: string;
  size?: 'sm' | 'md' | 'lg';
  /** Which side to put the label */
  labelPosition?: 'left' | 'right';
  style?: CSSProperties;
}

export declare function Switch(props: SwitchProps): JSX.Element;
