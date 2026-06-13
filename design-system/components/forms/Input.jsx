/**
 * Input — Text field with label, hint, error, and icon support.
 */
export function Input({
  label,
  hint,
  error,
  size = 'md',
  disabled = false,
  icon,
  iconRight,
  type = 'text',
  placeholder,
  value,
  onChange,
  style,
  containerStyle,
  id,
  ...rest
}) {
  const [focused, setFocused] = React.useState(false);

  const sizes = {
    sm: { height: '34px', fontSize: 'var(--text-sm)',   paddingH: 'var(--space-3)', iconOffset: '9px',  iconSize: 14 },
    md: { height: '42px', fontSize: 'var(--text-base)', paddingH: 'var(--space-4)', iconOffset: '12px', iconSize: 16 },
    lg: { height: '52px', fontSize: 'var(--text-md)',   paddingH: 'var(--space-5)', iconOffset: '15px', iconSize: 20 },
  };

  const s = sizes[size];
  const iconPaddingLeft  = icon      ? (size === 'sm' ? '32px' : size === 'lg' ? '46px' : '38px') : s.paddingH;
  const iconPaddingRight = iconRight ? (size === 'sm' ? '32px' : size === 'lg' ? '46px' : '38px') : s.paddingH;

  const inputStyle = {
    width: '100%',
    boxSizing: 'border-box',
    height: s.height,
    fontFamily: 'var(--font-sans)',
    fontSize: s.fontSize,
    color: 'var(--color-text-primary)',
    background: disabled ? 'var(--color-bg-secondary)' : 'var(--color-surface)',
    border: '1.5px solid ' + (error ? 'var(--color-error)' : focused ? 'var(--color-sky-400)' : 'var(--color-border)'),
    borderRadius: 'var(--radius-input)',
    paddingLeft: iconPaddingLeft,
    paddingRight: iconPaddingRight,
    outline: 'none',
    transition: 'border-color var(--duration-fast) var(--ease-out), box-shadow var(--duration-fast) var(--ease-out)',
    boxShadow: focused
      ? (error ? '0 0 0 3px rgba(240,76,76,0.12)' : '0 0 0 3px rgba(77,196,232,0.15)')
      : 'var(--shadow-xs)',
    cursor: disabled ? 'not-allowed' : 'text',
    opacity: disabled ? 0.6 : 1,
    ...style,
  };

  const inputId = id || (label ? 'pwa-input-' + label.replace(/\s+/g, '-').toLowerCase() : undefined);

  return React.createElement(
    'div',
    { style: { display: 'flex', flexDirection: 'column', gap: 'var(--space-1-5)', ...containerStyle } },
    label && React.createElement(
      'label',
      {
        htmlFor: inputId,
        style: {
          fontSize: 'var(--text-sm)',
          fontFamily: 'var(--font-sans)',
          fontWeight: 'var(--weight-medium)',
          color: error ? 'var(--color-error)' : 'var(--color-text-primary)',
          letterSpacing: '-0.01em',
          userSelect: 'none',
        },
      },
      label
    ),
    React.createElement(
      'div',
      { style: { position: 'relative' } },
      icon && React.createElement(
        'span',
        {
          style: {
            position: 'absolute', left: s.iconOffset, top: '50%', transform: 'translateY(-50%)',
            color: focused ? 'var(--color-sky-500)' : 'var(--color-text-tertiary)',
            display: 'flex', pointerEvents: 'none',
            transition: 'color var(--duration-fast) var(--ease-out)',
          },
        },
        React.createElement('svg', { width: s.iconSize, height: s.iconSize, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }, icon)
      ),
      React.createElement('input', {
        id: inputId,
        type, placeholder, value, onChange, disabled,
        onFocus: () => setFocused(true),
        onBlur:  () => setFocused(false),
        style: inputStyle,
        ...rest,
      }),
      iconRight && React.createElement(
        'span',
        {
          style: {
            position: 'absolute', right: s.iconOffset, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--color-text-tertiary)', display: 'flex', pointerEvents: 'none',
          },
        },
        React.createElement('svg', { width: s.iconSize, height: s.iconSize, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }, iconRight)
      )
    ),
    (hint || error) && React.createElement(
      'p',
      {
        style: {
          margin: 0, fontSize: 'var(--text-xs)', fontFamily: 'var(--font-sans)',
          color: error ? 'var(--color-error)' : 'var(--color-text-secondary)',
          lineHeight: 'var(--leading-normal)',
        },
      },
      error || hint
    )
  );
}
