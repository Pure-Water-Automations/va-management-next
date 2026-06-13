/**
 * Switch — Toggle control. Spring-animated thumb.
 * Perfect for automation on/off controls.
 */
export function Switch({
  checked = false,
  onChange,
  disabled = false,
  label,
  hint,
  size = 'md',
  labelPosition = 'right',
  style,
  ...rest
}) {
  const dims = {
    sm: { trackW: 30, trackH: 18, thumbS: 14, offset: 2, onOffset: 14 },
    md: { trackW: 44, trackH: 26, thumbS: 20, offset: 3, onOffset: 21 },
    lg: { trackW: 56, trackH: 32, thumbS: 26, offset: 3, onOffset: 27 },
  };

  const d = dims[size];

  const trackStyle = {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    width:  d.trackW + 'px',
    height: d.trackH + 'px',
    borderRadius: 'var(--radius-full)',
    background: checked
      ? 'linear-gradient(135deg, var(--color-sky-400), var(--color-sky-500))'
      : 'var(--color-neutral-300)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'background var(--duration-base) var(--ease-out)',
    flexShrink: 0,
    boxShadow: checked ? 'var(--shadow-sky-sm)' : 'var(--shadow-inset-sm)',
    opacity: disabled ? 0.5 : 1,
    outline: 'none',
    border: 'none',
  };

  const thumbStyle = {
    position: 'absolute',
    width:  d.thumbS + 'px',
    height: d.thumbS + 'px',
    borderRadius: '50%',
    background: '#ffffff',
    top: d.offset + 'px',
    left: (checked ? d.onOffset : d.offset) + 'px',
    transition: 'left var(--duration-base) var(--ease-spring)',
    boxShadow: '0 1px 4px rgba(0,0,0,0.22), 0 0 0 0.5px rgba(0,0,0,0.06)',
    pointerEvents: 'none',
  };

  const labelFontSize = size === 'sm' ? 'var(--text-sm)' : size === 'lg' ? 'var(--text-md)' : 'var(--text-base)';

  const handleClick = () => { if (!disabled) onChange && onChange(!checked); };
  const handleKey = (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); handleClick(); } };

  return React.createElement(
    'div',
    {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        userSelect: 'none',
        flexDirection: labelPosition === 'left' ? 'row-reverse' : 'row',
        ...style,
      },
      ...rest,
    },
    React.createElement(
      'div',
      {
        style: trackStyle,
        onClick: handleClick,
        onKeyDown: handleKey,
        role: 'switch',
        'aria-checked': checked,
        tabIndex: disabled ? -1 : 0,
      },
      React.createElement('div', { style: thumbStyle })
    ),
    (label || hint) && React.createElement(
      'div',
      { style: { display: 'flex', flexDirection: 'column', gap: '2px' } },
      label && React.createElement(
        'span',
        { style: { fontSize: labelFontSize, fontFamily: 'var(--font-sans)', fontWeight: 'var(--weight-medium)', color: 'var(--color-text-primary)', lineHeight: 1.2 } },
        label
      ),
      hint && React.createElement(
        'span',
        { style: { fontSize: 'var(--text-xs)', fontFamily: 'var(--font-sans)', color: 'var(--color-text-secondary)', lineHeight: 1.3 } },
        hint
      )
    )
  );
}
