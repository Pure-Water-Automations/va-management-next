/**
 * Badge — Status chip / pill label.
 * Semantic color variants for system states (online, warning, error, etc.).
 */
export function Badge({
  variant = 'default',
  size = 'md',
  dot = false,
  pulse = false,
  children,
  style,
  ...rest
}) {
  const variants = {
    default:     { background: 'var(--color-neutral-100)',    color: 'var(--color-neutral-700)',  border: '1px solid var(--color-neutral-200)' },
    primary:     { background: 'var(--color-navy-50)',        color: 'var(--color-navy-800)',     border: '1px solid var(--color-navy-100)' },
    sky:         { background: 'var(--color-sky-50)',         color: 'var(--color-sky-700)',      border: '1px solid var(--color-sky-100)' },
    success:     { background: 'var(--color-success-light)',  color: 'var(--color-success-dark)', border: '1px solid rgba(48,201,122,0.22)' },
    warning:     { background: 'var(--color-warning-light)',  color: 'var(--color-warning-dark)', border: '1px solid rgba(255,179,64,0.28)' },
    danger:      { background: 'var(--color-error-light)',    color: 'var(--color-error-dark)',   border: '1px solid rgba(240,76,76,0.22)' },
    info:        { background: 'var(--color-info-light)',     color: 'var(--color-info-dark)',    border: '1px solid rgba(77,196,232,0.25)' },
    solid:       { background: 'var(--color-navy-900)',       color: '#ffffff',                   border: 'none' },
    'solid-sky': { background: 'var(--color-sky-400)',        color: '#ffffff',                   border: 'none' },
    outline:     { background: 'transparent',                 color: 'var(--color-navy-800)',     border: '1.5px solid var(--color-navy-200)' },
  };

  const sizes = {
    sm: { fontSize: 'var(--text-xs)',   padding: '0 var(--space-2)',   height: '18px', gap: 'var(--space-1)' },
    md: { fontSize: 'var(--text-sm)',   padding: '0 var(--space-2-5)', height: '22px', gap: 'var(--space-1-5)' },
    lg: { fontSize: 'var(--text-base)', padding: '0 var(--space-3)',   height: '28px', gap: 'var(--space-2)' },
  };

  const dotColors = {
    success: 'var(--color-success)',
    danger:  'var(--color-error)',
    warning: 'var(--color-warning)',
    sky:     'var(--color-sky-500)',
    info:    'var(--color-sky-500)',
    primary: 'var(--color-navy-700)',
    solid:   'rgba(255,255,255,0.8)',
    'solid-sky': 'rgba(255,255,255,0.8)',
    default: 'var(--color-neutral-400)',
    outline: 'var(--color-navy-400)',
  };

  const dotSize = size === 'sm' ? 5 : size === 'lg' ? 8 : 6;

  return React.createElement(
    React.Fragment, null,
    React.createElement(
      'span',
      {
        style: {
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 'var(--radius-badge)',
          fontFamily: 'var(--font-sans)',
          fontWeight: 'var(--weight-medium)',
          letterSpacing: '0.01em',
          whiteSpace: 'nowrap',
          lineHeight: 1,
          ...sizes[size],
          ...variants[variant],
          ...style,
        },
        ...rest,
      },
      dot && React.createElement('span', {
        style: {
          width: dotSize, height: dotSize, flexShrink: 0,
          borderRadius: '50%',
          background: dotColors[variant] || 'var(--color-neutral-400)',
          display: 'inline-block',
          animation: pulse ? 'pwa-pulse-glow 1.8s ease-in-out infinite' : 'none',
        },
      }),
      children
    ),
    pulse && React.createElement('style', null,
      '@keyframes pwa-pulse-glow { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.6;transform:scale(1.2)} }'
    )
  );
}
