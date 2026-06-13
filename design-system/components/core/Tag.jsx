/**
 * Tag — Category / filter label. Optionally removable.
 * Rectangular with subtle rounding, unlike the pill Badge.
 */
export function Tag({
  variant = 'default',
  size = 'md',
  removable = false,
  onRemove,
  children,
  style,
  ...rest
}) {
  const variants = {
    default: { background: 'var(--color-neutral-100)', color: 'var(--color-neutral-700)', border: '1px solid var(--color-neutral-200)' },
    primary: { background: 'var(--color-navy-50)',     color: 'var(--color-navy-800)',    border: '1px solid var(--color-navy-100)' },
    sky:     { background: 'var(--color-sky-50)',      color: 'var(--color-sky-700)',     border: '1px solid var(--color-sky-100)' },
    success: { background: 'var(--color-success-light)', color: 'var(--color-success-dark)', border: '1px solid rgba(48,201,122,0.2)' },
    warning: { background: 'var(--color-warning-light)', color: 'var(--color-warning-dark)', border: '1px solid rgba(255,179,64,0.25)' },
    danger:  { background: 'var(--color-error-light)',   color: 'var(--color-error-dark)',   border: '1px solid rgba(240,76,76,0.2)' },
    outline: { background: 'transparent',              color: 'var(--color-navy-800)',    border: '1px solid var(--color-navy-200)' },
    solid:   { background: 'var(--color-navy-900)',    color: '#ffffff',                  border: 'none' },
  };

  const sizes = {
    sm: { fontSize: 'var(--text-xs)',   padding: '0.25rem 0.5rem',    gap: 'var(--space-1)',   borderRadius: 'var(--radius-xs)' },
    md: { fontSize: 'var(--text-sm)',   padding: '0.3rem 0.75rem',    gap: 'var(--space-1-5)', borderRadius: 'var(--radius-sm)' },
    lg: { fontSize: 'var(--text-base)', padding: '0.4375rem 1rem',    gap: 'var(--space-2)',   borderRadius: 'var(--radius-md)' },
  };

  return React.createElement(
    'span',
    {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        fontFamily: 'var(--font-sans)',
        fontWeight: 'var(--weight-medium)',
        whiteSpace: 'nowrap',
        lineHeight: 1,
        ...sizes[size],
        ...variants[variant],
        ...style,
      },
      ...rest,
    },
    children,
    removable && React.createElement(
      'button',
      {
        onClick: (e) => { e.stopPropagation(); onRemove && onRemove(); },
        style: {
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'none', border: 'none', padding: 0,
          cursor: 'pointer', color: 'inherit',
          opacity: 0.55, borderRadius: '50%',
          width: '14px', height: '14px', flexShrink: 0,
          transition: 'opacity var(--duration-fast) var(--ease-out)',
        },
        onMouseEnter: (e) => { e.currentTarget.style.opacity = '1'; },
        onMouseLeave: (e) => { e.currentTarget.style.opacity = '0.55'; },
        'aria-label': 'Remove',
      },
      React.createElement('svg', { width: 9, height: 9, viewBox: '0 0 10 10', fill: 'none' },
        React.createElement('path', { d: 'M1 1L9 9M9 1L1 9', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round' })
      )
    )
  );
}
