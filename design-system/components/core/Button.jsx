/**
 * Button — Primary interactive control. Pill-shaped, Apple-inspired.
 * Supports primary (navy gradient), secondary (sky), ghost, outline, danger, and text variants.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  fullWidth = false,
  icon,
  iconRight,
  onClick,
  type = 'button',
  href,
  children,
  style,
  ...rest
}) {
  const sizes = {
    xs: { height: '28px', padding: '0 var(--space-3)',   fontSize: 'var(--text-xs)',   gap: 'var(--space-1)' },
    sm: { height: '34px', padding: '0 var(--space-4)',   fontSize: 'var(--text-sm)',   gap: 'var(--space-1-5)' },
    md: { height: '42px', padding: '0 var(--space-5)',   fontSize: 'var(--text-base)', gap: 'var(--space-2)' },
    lg: { height: '52px', padding: '0 var(--space-7)',   fontSize: 'var(--text-md)',   gap: 'var(--space-2-5)' },
    xl: { height: '62px', padding: '0 var(--space-10)',  fontSize: 'var(--text-lg)',   gap: 'var(--space-3)' },
  };

  const variants = {
    primary: {
      background: 'linear-gradient(180deg, var(--color-navy-800) 0%, var(--color-navy-900) 100%)',
      color: '#ffffff',
      border: '1px solid rgba(255,255,255,0.08)',
      boxShadow: 'var(--shadow-navy-sm)',
    },
    secondary: {
      background: 'linear-gradient(180deg, var(--color-sky-400) 0%, var(--color-sky-500) 100%)',
      color: '#ffffff',
      border: '1px solid rgba(255,255,255,0.15)',
      boxShadow: 'var(--shadow-sky-sm)',
    },
    ghost: {
      background: 'rgba(255,255,255,0)',
      color: 'var(--color-navy-900)',
      border: '1px solid var(--color-border)',
      boxShadow: 'var(--shadow-xs)',
    },
    outline: {
      background: 'transparent',
      color: 'var(--color-navy-900)',
      border: '1.5px solid var(--color-navy-900)',
      boxShadow: 'none',
    },
    'outline-sky': {
      background: 'transparent',
      color: 'var(--color-sky-600)',
      border: '1.5px solid var(--color-sky-400)',
      boxShadow: 'none',
    },
    danger: {
      background: 'linear-gradient(180deg, #f26060 0%, var(--color-error) 100%)',
      color: '#ffffff',
      border: 'none',
      boxShadow: '0 4px 12px rgba(240,76,76,0.25), 0 2px 6px rgba(240,76,76,0.15)',
    },
    text: {
      background: 'transparent',
      color: 'var(--color-navy-800)',
      border: 'none',
      boxShadow: 'none',
    },
  };

  const hoverShadow = {
    primary:      'var(--shadow-navy-md)',
    secondary:    'var(--shadow-sky-md)',
    ghost:        'var(--shadow-sm)',
    outline:      'var(--shadow-xs)',
    'outline-sky':'var(--shadow-xs)',
    danger:       '0 8px 20px rgba(240,76,76,0.35)',
    text:         'none',
  };

  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 'var(--radius-button)',
    fontFamily: 'var(--font-sans)',
    fontWeight: 'var(--weight-medium)',
    letterSpacing: '-0.01em',
    cursor: disabled || loading ? 'not-allowed' : 'pointer',
    outline: 'none',
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    userSelect: 'none',
    transition:
      'transform var(--duration-base) var(--ease-spring), box-shadow var(--duration-base) var(--ease-out), opacity var(--duration-fast) var(--ease-out)',
    width: fullWidth ? '100%' : undefined,
    opacity: disabled ? 0.45 : 1,
    WebkitTapHighlightColor: 'transparent',
    flexShrink: 0,
    ...sizes[size],
    ...variants[variant],
    ...style,
  };

  function onEnter(e) {
    if (disabled || loading) return;
    e.currentTarget.style.transform = 'translateY(-1px) scale(1.015)';
    e.currentTarget.style.boxShadow = hoverShadow[variant] || '';
  }
  function onLeave(e) {
    e.currentTarget.style.transform = '';
    e.currentTarget.style.boxShadow = variants[variant]?.boxShadow || '';
  }
  function onDown(e) {
    if (disabled || loading) return;
    e.currentTarget.style.transform = 'translateY(0) scale(0.97)';
  }
  function onUp(e) {
    if (disabled || loading) return;
    e.currentTarget.style.transform = 'translateY(-1px) scale(1.015)';
  }

  const spinSize = { xs: 11, sm: 13, md: 15, lg: 18, xl: 20 }[size];

  const inner = React.createElement(
    React.Fragment, null,
    loading
      ? React.createElement('svg', {
          width: spinSize, height: spinSize, viewBox: '0 0 24 24', fill: 'none',
          style: { animation: 'pwa-spin 0.7s linear infinite', flexShrink: 0 },
        },
          React.createElement('circle', { cx: 12, cy: 12, r: 9, stroke: 'currentColor', strokeWidth: 2.5, strokeOpacity: 0.25 }),
          React.createElement('path', { d: 'M12 3a9 9 0 0 1 9 9', stroke: 'currentColor', strokeWidth: 2.5, strokeLinecap: 'round' })
        )
      : icon
        ? React.createElement('span', { style: { display: 'flex', alignItems: 'center', lineHeight: 1, flexShrink: 0 } }, icon)
        : null,
    children,
    !loading && iconRight
      ? React.createElement('span', { style: { display: 'flex', alignItems: 'center', lineHeight: 1, flexShrink: 0 } }, iconRight)
      : null
  );

  if (href) {
    return React.createElement('a', {
      href, style: base,
      onMouseEnter: onEnter, onMouseLeave: onLeave, onMouseDown: onDown, onMouseUp: onUp,
      ...rest,
    }, inner);
  }

  return React.createElement('button', {
    type, disabled: disabled || loading, onClick, style: base,
    onMouseEnter: onEnter, onMouseLeave: onLeave, onMouseDown: onDown, onMouseUp: onUp,
    ...rest,
  }, inner);
}
