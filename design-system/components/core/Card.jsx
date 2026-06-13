/**
 * Card — Content container with elevation variants.
 * Apple-inspired: rounded, minimal borders, soft shadows.
 */
export function Card({
  variant = 'default',
  padding = 'md',
  radius = 'card',
  hoverable = false,
  onClick,
  children,
  style,
  ...rest
}) {
  const paddings = {
    none: '0',
    xs:   'var(--space-3)',
    sm:   'var(--space-4)',
    md:   'var(--space-6)',
    lg:   'var(--space-8)',
    xl:   'var(--space-10)',
  };

  const radii = {
    sm:   'var(--radius-lg)',
    md:   'var(--radius-xl)',
    card: 'var(--radius-card)',
    lg:   'var(--radius-3xl)',
  };

  const variants = {
    default: {
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      boxShadow: 'var(--shadow-sm)',
    },
    elevated: {
      background: 'var(--color-surface)',
      border: 'none',
      boxShadow: 'var(--shadow-lg)',
    },
    glass: {
      background: 'var(--color-glass-bg)',
      backdropFilter: 'blur(20px) saturate(180%)',
      WebkitBackdropFilter: 'blur(20px) saturate(180%)',
      border: '1px solid var(--color-glass-border)',
      boxShadow: 'var(--shadow-md)',
    },
    navy: {
      background: 'linear-gradient(145deg, var(--color-navy-800) 0%, var(--color-navy-900) 100%)',
      border: '1px solid rgba(255,255,255,0.1)',
      boxShadow: 'var(--shadow-navy-lg)',
      color: '#ffffff',
    },
    sky: {
      background: 'linear-gradient(145deg, var(--color-sky-400) 0%, var(--color-sky-500) 100%)',
      border: '1px solid rgba(255,255,255,0.2)',
      boxShadow: 'var(--shadow-sky-md)',
      color: '#ffffff',
    },
    flat: {
      background: 'var(--color-bg-secondary)',
      border: 'none',
      boxShadow: 'none',
    },
    outline: {
      background: 'transparent',
      border: '1.5px solid var(--color-border)',
      boxShadow: 'none',
    },
  };

  const hoverShadows = {
    default:  'var(--shadow-md)',
    elevated: 'var(--shadow-xl)',
    glass:    'var(--shadow-lg)',
    navy:     'var(--shadow-navy-xl)',
    sky:      'var(--shadow-sky-lg)',
    flat:     'var(--shadow-sm)',
    outline:  'var(--shadow-md)',
  };

  const isInteractive = !!(onClick || hoverable);

  const base = {
    borderRadius: radii[radius] || radius,
    padding: paddings[padding],
    transition:
      'transform var(--duration-base) var(--ease-spring), box-shadow var(--duration-base) var(--ease-out)',
    cursor: isInteractive ? 'pointer' : 'default',
    ...variants[variant],
    ...style,
  };

  function onEnter(e) {
    if (!isInteractive) return;
    e.currentTarget.style.transform = 'translateY(-2px)';
    e.currentTarget.style.boxShadow = hoverShadows[variant] || '';
  }
  function onLeave(e) {
    if (!isInteractive) return;
    e.currentTarget.style.transform = '';
    e.currentTarget.style.boxShadow = variants[variant]?.boxShadow || '';
  }

  return React.createElement('div', {
    onClick,
    onMouseEnter: onEnter,
    onMouseLeave: onLeave,
    style: base,
    ...rest,
  }, children);
}
