/* @ds-bundle: {"format":3,"namespace":"PWADesignSystem_9304be","components":[{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"Tag","sourcePath":"components/core/Tag.jsx"},{"name":"Stat","sourcePath":"components/data/Stat.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"Switch","sourcePath":"components/forms/Switch.jsx"}],"sourceHashes":{"components/core/Badge.jsx":"62f8b306c735","components/core/Button.jsx":"2a4c5c9413be","components/core/Card.jsx":"ed48693bb15d","components/core/Tag.jsx":"3f6584c2a946","components/data/Stat.jsx":"6d7055dd89bb","components/forms/Input.jsx":"c4769fdf4344","components/forms/Switch.jsx":"c208e4cb22b5"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.PWADesignSystem_9304be = window.PWADesignSystem_9304be || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Badge.jsx
try { (() => {
/**
 * Badge — Status chip / pill label.
 * Semantic color variants for system states (online, warning, error, etc.).
 */
function Badge({
  variant = 'default',
  size = 'md',
  dot = false,
  pulse = false,
  children,
  style,
  ...rest
}) {
  const variants = {
    default: {
      background: 'var(--color-neutral-100)',
      color: 'var(--color-neutral-700)',
      border: '1px solid var(--color-neutral-200)'
    },
    primary: {
      background: 'var(--color-navy-50)',
      color: 'var(--color-navy-800)',
      border: '1px solid var(--color-navy-100)'
    },
    sky: {
      background: 'var(--color-sky-50)',
      color: 'var(--color-sky-700)',
      border: '1px solid var(--color-sky-100)'
    },
    success: {
      background: 'var(--color-success-light)',
      color: 'var(--color-success-dark)',
      border: '1px solid rgba(48,201,122,0.22)'
    },
    warning: {
      background: 'var(--color-warning-light)',
      color: 'var(--color-warning-dark)',
      border: '1px solid rgba(255,179,64,0.28)'
    },
    danger: {
      background: 'var(--color-error-light)',
      color: 'var(--color-error-dark)',
      border: '1px solid rgba(240,76,76,0.22)'
    },
    info: {
      background: 'var(--color-info-light)',
      color: 'var(--color-info-dark)',
      border: '1px solid rgba(77,196,232,0.25)'
    },
    solid: {
      background: 'var(--color-navy-900)',
      color: '#ffffff',
      border: 'none'
    },
    'solid-sky': {
      background: 'var(--color-sky-400)',
      color: '#ffffff',
      border: 'none'
    },
    outline: {
      background: 'transparent',
      color: 'var(--color-navy-800)',
      border: '1.5px solid var(--color-navy-200)'
    }
  };
  const sizes = {
    sm: {
      fontSize: 'var(--text-xs)',
      padding: '0 var(--space-2)',
      height: '18px',
      gap: 'var(--space-1)'
    },
    md: {
      fontSize: 'var(--text-sm)',
      padding: '0 var(--space-2-5)',
      height: '22px',
      gap: 'var(--space-1-5)'
    },
    lg: {
      fontSize: 'var(--text-base)',
      padding: '0 var(--space-3)',
      height: '28px',
      gap: 'var(--space-2)'
    }
  };
  const dotColors = {
    success: 'var(--color-success)',
    danger: 'var(--color-error)',
    warning: 'var(--color-warning)',
    sky: 'var(--color-sky-500)',
    info: 'var(--color-sky-500)',
    primary: 'var(--color-navy-700)',
    solid: 'rgba(255,255,255,0.8)',
    'solid-sky': 'rgba(255,255,255,0.8)',
    default: 'var(--color-neutral-400)',
    outline: 'var(--color-navy-400)'
  };
  const dotSize = size === 'sm' ? 5 : size === 'lg' ? 8 : 6;
  return React.createElement(React.Fragment, null, React.createElement('span', {
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
      ...style
    },
    ...rest
  }, dot && React.createElement('span', {
    style: {
      width: dotSize,
      height: dotSize,
      flexShrink: 0,
      borderRadius: '50%',
      background: dotColors[variant] || 'var(--color-neutral-400)',
      display: 'inline-block',
      animation: pulse ? 'pwa-pulse-glow 1.8s ease-in-out infinite' : 'none'
    }
  }), children), pulse && React.createElement('style', null, '@keyframes pwa-pulse-glow { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.6;transform:scale(1.2)} }'));
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
/**
 * Button — Primary interactive control. Pill-shaped, Apple-inspired.
 * Supports primary (navy gradient), secondary (sky), ghost, outline, danger, and text variants.
 */
function Button({
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
    xs: {
      height: '28px',
      padding: '0 var(--space-3)',
      fontSize: 'var(--text-xs)',
      gap: 'var(--space-1)'
    },
    sm: {
      height: '34px',
      padding: '0 var(--space-4)',
      fontSize: 'var(--text-sm)',
      gap: 'var(--space-1-5)'
    },
    md: {
      height: '42px',
      padding: '0 var(--space-5)',
      fontSize: 'var(--text-base)',
      gap: 'var(--space-2)'
    },
    lg: {
      height: '52px',
      padding: '0 var(--space-7)',
      fontSize: 'var(--text-md)',
      gap: 'var(--space-2-5)'
    },
    xl: {
      height: '62px',
      padding: '0 var(--space-10)',
      fontSize: 'var(--text-lg)',
      gap: 'var(--space-3)'
    }
  };
  const variants = {
    primary: {
      background: 'linear-gradient(180deg, var(--color-navy-800) 0%, var(--color-navy-900) 100%)',
      color: '#ffffff',
      border: '1px solid rgba(255,255,255,0.08)',
      boxShadow: 'var(--shadow-navy-sm)'
    },
    secondary: {
      background: 'linear-gradient(180deg, var(--color-sky-400) 0%, var(--color-sky-500) 100%)',
      color: '#ffffff',
      border: '1px solid rgba(255,255,255,0.15)',
      boxShadow: 'var(--shadow-sky-sm)'
    },
    ghost: {
      background: 'rgba(255,255,255,0)',
      color: 'var(--color-navy-900)',
      border: '1px solid var(--color-border)',
      boxShadow: 'var(--shadow-xs)'
    },
    outline: {
      background: 'transparent',
      color: 'var(--color-navy-900)',
      border: '1.5px solid var(--color-navy-900)',
      boxShadow: 'none'
    },
    'outline-sky': {
      background: 'transparent',
      color: 'var(--color-sky-600)',
      border: '1.5px solid var(--color-sky-400)',
      boxShadow: 'none'
    },
    danger: {
      background: 'linear-gradient(180deg, #f26060 0%, var(--color-error) 100%)',
      color: '#ffffff',
      border: 'none',
      boxShadow: '0 4px 12px rgba(240,76,76,0.25), 0 2px 6px rgba(240,76,76,0.15)'
    },
    text: {
      background: 'transparent',
      color: 'var(--color-navy-800)',
      border: 'none',
      boxShadow: 'none'
    }
  };
  const hoverShadow = {
    primary: 'var(--shadow-navy-md)',
    secondary: 'var(--shadow-sky-md)',
    ghost: 'var(--shadow-sm)',
    outline: 'var(--shadow-xs)',
    'outline-sky': 'var(--shadow-xs)',
    danger: '0 8px 20px rgba(240,76,76,0.35)',
    text: 'none'
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
    transition: 'transform var(--duration-base) var(--ease-spring), box-shadow var(--duration-base) var(--ease-out), opacity var(--duration-fast) var(--ease-out)',
    width: fullWidth ? '100%' : undefined,
    opacity: disabled ? 0.45 : 1,
    WebkitTapHighlightColor: 'transparent',
    flexShrink: 0,
    ...sizes[size],
    ...variants[variant],
    ...style
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
  const spinSize = {
    xs: 11,
    sm: 13,
    md: 15,
    lg: 18,
    xl: 20
  }[size];
  const inner = React.createElement(React.Fragment, null, loading ? React.createElement('svg', {
    width: spinSize,
    height: spinSize,
    viewBox: '0 0 24 24',
    fill: 'none',
    style: {
      animation: 'pwa-spin 0.7s linear infinite',
      flexShrink: 0
    }
  }, React.createElement('circle', {
    cx: 12,
    cy: 12,
    r: 9,
    stroke: 'currentColor',
    strokeWidth: 2.5,
    strokeOpacity: 0.25
  }), React.createElement('path', {
    d: 'M12 3a9 9 0 0 1 9 9',
    stroke: 'currentColor',
    strokeWidth: 2.5,
    strokeLinecap: 'round'
  })) : icon ? React.createElement('span', {
    style: {
      display: 'flex',
      alignItems: 'center',
      lineHeight: 1,
      flexShrink: 0
    }
  }, icon) : null, children, !loading && iconRight ? React.createElement('span', {
    style: {
      display: 'flex',
      alignItems: 'center',
      lineHeight: 1,
      flexShrink: 0
    }
  }, iconRight) : null);
  if (href) {
    return React.createElement('a', {
      href,
      style: base,
      onMouseEnter: onEnter,
      onMouseLeave: onLeave,
      onMouseDown: onDown,
      onMouseUp: onUp,
      ...rest
    }, inner);
  }
  return React.createElement('button', {
    type,
    disabled: disabled || loading,
    onClick,
    style: base,
    onMouseEnter: onEnter,
    onMouseLeave: onLeave,
    onMouseDown: onDown,
    onMouseUp: onUp,
    ...rest
  }, inner);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
/**
 * Card — Content container with elevation variants.
 * Apple-inspired: rounded, minimal borders, soft shadows.
 */
function Card({
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
    xs: 'var(--space-3)',
    sm: 'var(--space-4)',
    md: 'var(--space-6)',
    lg: 'var(--space-8)',
    xl: 'var(--space-10)'
  };
  const radii = {
    sm: 'var(--radius-lg)',
    md: 'var(--radius-xl)',
    card: 'var(--radius-card)',
    lg: 'var(--radius-3xl)'
  };
  const variants = {
    default: {
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      boxShadow: 'var(--shadow-sm)'
    },
    elevated: {
      background: 'var(--color-surface)',
      border: 'none',
      boxShadow: 'var(--shadow-lg)'
    },
    glass: {
      background: 'var(--color-glass-bg)',
      backdropFilter: 'blur(20px) saturate(180%)',
      WebkitBackdropFilter: 'blur(20px) saturate(180%)',
      border: '1px solid var(--color-glass-border)',
      boxShadow: 'var(--shadow-md)'
    },
    navy: {
      background: 'linear-gradient(145deg, var(--color-navy-800) 0%, var(--color-navy-900) 100%)',
      border: '1px solid rgba(255,255,255,0.1)',
      boxShadow: 'var(--shadow-navy-lg)',
      color: '#ffffff'
    },
    sky: {
      background: 'linear-gradient(145deg, var(--color-sky-400) 0%, var(--color-sky-500) 100%)',
      border: '1px solid rgba(255,255,255,0.2)',
      boxShadow: 'var(--shadow-sky-md)',
      color: '#ffffff'
    },
    flat: {
      background: 'var(--color-bg-secondary)',
      border: 'none',
      boxShadow: 'none'
    },
    outline: {
      background: 'transparent',
      border: '1.5px solid var(--color-border)',
      boxShadow: 'none'
    }
  };
  const hoverShadows = {
    default: 'var(--shadow-md)',
    elevated: 'var(--shadow-xl)',
    glass: 'var(--shadow-lg)',
    navy: 'var(--shadow-navy-xl)',
    sky: 'var(--shadow-sky-lg)',
    flat: 'var(--shadow-sm)',
    outline: 'var(--shadow-md)'
  };
  const isInteractive = !!(onClick || hoverable);
  const base = {
    borderRadius: radii[radius] || radius,
    padding: paddings[padding],
    transition: 'transform var(--duration-base) var(--ease-spring), box-shadow var(--duration-base) var(--ease-out)',
    cursor: isInteractive ? 'pointer' : 'default',
    ...variants[variant],
    ...style
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
    ...rest
  }, children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/Tag.jsx
try { (() => {
/**
 * Tag — Category / filter label. Optionally removable.
 * Rectangular with subtle rounding, unlike the pill Badge.
 */
function Tag({
  variant = 'default',
  size = 'md',
  removable = false,
  onRemove,
  children,
  style,
  ...rest
}) {
  const variants = {
    default: {
      background: 'var(--color-neutral-100)',
      color: 'var(--color-neutral-700)',
      border: '1px solid var(--color-neutral-200)'
    },
    primary: {
      background: 'var(--color-navy-50)',
      color: 'var(--color-navy-800)',
      border: '1px solid var(--color-navy-100)'
    },
    sky: {
      background: 'var(--color-sky-50)',
      color: 'var(--color-sky-700)',
      border: '1px solid var(--color-sky-100)'
    },
    success: {
      background: 'var(--color-success-light)',
      color: 'var(--color-success-dark)',
      border: '1px solid rgba(48,201,122,0.2)'
    },
    warning: {
      background: 'var(--color-warning-light)',
      color: 'var(--color-warning-dark)',
      border: '1px solid rgba(255,179,64,0.25)'
    },
    danger: {
      background: 'var(--color-error-light)',
      color: 'var(--color-error-dark)',
      border: '1px solid rgba(240,76,76,0.2)'
    },
    outline: {
      background: 'transparent',
      color: 'var(--color-navy-800)',
      border: '1px solid var(--color-navy-200)'
    },
    solid: {
      background: 'var(--color-navy-900)',
      color: '#ffffff',
      border: 'none'
    }
  };
  const sizes = {
    sm: {
      fontSize: 'var(--text-xs)',
      padding: '0.25rem 0.5rem',
      gap: 'var(--space-1)',
      borderRadius: 'var(--radius-xs)'
    },
    md: {
      fontSize: 'var(--text-sm)',
      padding: '0.3rem 0.75rem',
      gap: 'var(--space-1-5)',
      borderRadius: 'var(--radius-sm)'
    },
    lg: {
      fontSize: 'var(--text-base)',
      padding: '0.4375rem 1rem',
      gap: 'var(--space-2)',
      borderRadius: 'var(--radius-md)'
    }
  };
  return React.createElement('span', {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      fontFamily: 'var(--font-sans)',
      fontWeight: 'var(--weight-medium)',
      whiteSpace: 'nowrap',
      lineHeight: 1,
      ...sizes[size],
      ...variants[variant],
      ...style
    },
    ...rest
  }, children, removable && React.createElement('button', {
    onClick: e => {
      e.stopPropagation();
      onRemove && onRemove();
    },
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'none',
      border: 'none',
      padding: 0,
      cursor: 'pointer',
      color: 'inherit',
      opacity: 0.55,
      borderRadius: '50%',
      width: '14px',
      height: '14px',
      flexShrink: 0,
      transition: 'opacity var(--duration-fast) var(--ease-out)'
    },
    onMouseEnter: e => {
      e.currentTarget.style.opacity = '1';
    },
    onMouseLeave: e => {
      e.currentTarget.style.opacity = '0.55';
    },
    'aria-label': 'Remove'
  }, React.createElement('svg', {
    width: 9,
    height: 9,
    viewBox: '0 0 10 10',
    fill: 'none'
  }, React.createElement('path', {
    d: 'M1 1L9 9M9 1L1 9',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round'
  }))));
}
Object.assign(__ds_scope, { Tag });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Tag.jsx", error: String((e && e.message) || e) }); }

// components/data/Stat.jsx
try { (() => {
/**
 * Stat — KPI metric card with value, label, trend indicator, and optional icon.
 * Core building block for PWA monitoring dashboards.
 */
function Stat({
  label,
  value,
  unit,
  change,
  changeLabel,
  trend = 'neutral',
  icon,
  variant = 'default',
  style,
  ...rest
}) {
  const trendColors = {
    up: 'var(--color-success)',
    down: 'var(--color-error)',
    neutral: 'var(--color-text-secondary)'
  };
  const trendBgs = {
    up: 'var(--color-success-light)',
    down: 'var(--color-error-light)',
    neutral: 'var(--color-neutral-100)'
  };
  const isNavy = variant === 'navy';
  const isSky = variant === 'sky';
  const isDark = isNavy || isSky;
  const containerStyle = {
    borderRadius: 'var(--radius-2xl)',
    padding: 'var(--space-6)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
    ...(isNavy ? {
      background: 'linear-gradient(145deg, var(--color-navy-800) 0%, var(--color-navy-900) 100%)',
      border: '1px solid rgba(255,255,255,0.1)',
      boxShadow: 'var(--shadow-navy-md)'
    } : isSky ? {
      background: 'linear-gradient(145deg, var(--color-sky-400) 0%, var(--color-sky-500) 100%)',
      border: '1px solid rgba(255,255,255,0.2)',
      boxShadow: 'var(--shadow-sky-md)'
    } : {
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      boxShadow: 'var(--shadow-sm)'
    }),
    ...style
  };
  const trendArrow = trend === 'up' ? React.createElement('svg', {
    width: 10,
    height: 10,
    viewBox: '0 0 10 10',
    fill: 'none'
  }, React.createElement('path', {
    d: 'M5 8L2 4.5h6L5 8Z',
    fill: 'currentColor',
    transform: 'rotate(180 5 5)'
  })) : trend === 'down' ? React.createElement('svg', {
    width: 10,
    height: 10,
    viewBox: '0 0 10 10',
    fill: 'none'
  }, React.createElement('path', {
    d: 'M5 2L8 5.5H2L5 2Z',
    fill: 'currentColor',
    transform: 'rotate(180 5 5)'
  })) : null;
  return React.createElement('div', {
    style: containerStyle,
    ...rest
  }, /* Header row */
  React.createElement('div', {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between'
    }
  }, React.createElement('span', {
    style: {
      fontSize: 'var(--text-sm)',
      fontFamily: 'var(--font-sans)',
      fontWeight: 'var(--weight-medium)',
      letterSpacing: '0.01em',
      color: isDark ? 'rgba(255,255,255,0.7)' : 'var(--color-text-secondary)'
    }
  }, label), icon && React.createElement('span', {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '36px',
      height: '36px',
      borderRadius: 'var(--radius-md)',
      background: isDark ? 'rgba(255,255,255,0.14)' : 'var(--color-sky-50)',
      color: isDark ? 'rgba(255,255,255,0.9)' : 'var(--color-sky-500)',
      flexShrink: 0
    }
  }, icon)), /* Value row */
  React.createElement('div', {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 'var(--space-1-5)'
    }
  }, React.createElement('span', {
    style: {
      fontSize: 'var(--text-4xl)',
      fontFamily: 'var(--font-display)',
      fontWeight: 'var(--weight-bold)',
      letterSpacing: 'var(--tracking-tight)',
      lineHeight: 1,
      color: isDark ? '#ffffff' : 'var(--color-text-primary)'
    }
  }, value), unit && React.createElement('span', {
    style: {
      fontSize: 'var(--text-lg)',
      fontFamily: 'var(--font-sans)',
      fontWeight: 'var(--weight-medium)',
      color: isDark ? 'rgba(255,255,255,0.55)' : 'var(--color-text-secondary)'
    }
  }, unit)), /* Trend row */
  (change !== undefined || changeLabel) && React.createElement('div', {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-2)'
    }
  }, change !== undefined && React.createElement('span', {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '3px',
      background: isDark ? 'rgba(255,255,255,0.15)' : trendBgs[trend],
      color: isDark ? 'rgba(255,255,255,0.9)' : trendColors[trend],
      padding: '2px 8px',
      borderRadius: 'var(--radius-full)',
      fontSize: 'var(--text-xs)',
      fontWeight: 'var(--weight-semibold)',
      fontFamily: 'var(--font-sans)'
    }
  }, trendArrow, change), changeLabel && React.createElement('span', {
    style: {
      fontSize: 'var(--text-xs)',
      fontFamily: 'var(--font-sans)',
      color: isDark ? 'rgba(255,255,255,0.45)' : 'var(--color-text-tertiary)'
    }
  }, changeLabel)));
}
Object.assign(__ds_scope, { Stat });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Stat.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
/**
 * Input — Text field with label, hint, error, and icon support.
 */
function Input({
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
    sm: {
      height: '34px',
      fontSize: 'var(--text-sm)',
      paddingH: 'var(--space-3)',
      iconOffset: '9px',
      iconSize: 14
    },
    md: {
      height: '42px',
      fontSize: 'var(--text-base)',
      paddingH: 'var(--space-4)',
      iconOffset: '12px',
      iconSize: 16
    },
    lg: {
      height: '52px',
      fontSize: 'var(--text-md)',
      paddingH: 'var(--space-5)',
      iconOffset: '15px',
      iconSize: 20
    }
  };
  const s = sizes[size];
  const iconPaddingLeft = icon ? size === 'sm' ? '32px' : size === 'lg' ? '46px' : '38px' : s.paddingH;
  const iconPaddingRight = iconRight ? size === 'sm' ? '32px' : size === 'lg' ? '46px' : '38px' : s.paddingH;
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
    boxShadow: focused ? error ? '0 0 0 3px rgba(240,76,76,0.12)' : '0 0 0 3px rgba(77,196,232,0.15)' : 'var(--shadow-xs)',
    cursor: disabled ? 'not-allowed' : 'text',
    opacity: disabled ? 0.6 : 1,
    ...style
  };
  const inputId = id || (label ? 'pwa-input-' + label.replace(/\s+/g, '-').toLowerCase() : undefined);
  return React.createElement('div', {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-1-5)',
      ...containerStyle
    }
  }, label && React.createElement('label', {
    htmlFor: inputId,
    style: {
      fontSize: 'var(--text-sm)',
      fontFamily: 'var(--font-sans)',
      fontWeight: 'var(--weight-medium)',
      color: error ? 'var(--color-error)' : 'var(--color-text-primary)',
      letterSpacing: '-0.01em',
      userSelect: 'none'
    }
  }, label), React.createElement('div', {
    style: {
      position: 'relative'
    }
  }, icon && React.createElement('span', {
    style: {
      position: 'absolute',
      left: s.iconOffset,
      top: '50%',
      transform: 'translateY(-50%)',
      color: focused ? 'var(--color-sky-500)' : 'var(--color-text-tertiary)',
      display: 'flex',
      pointerEvents: 'none',
      transition: 'color var(--duration-fast) var(--ease-out)'
    }
  }, React.createElement('svg', {
    width: s.iconSize,
    height: s.iconSize,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round'
  }, icon)), React.createElement('input', {
    id: inputId,
    type,
    placeholder,
    value,
    onChange,
    disabled,
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    style: inputStyle,
    ...rest
  }), iconRight && React.createElement('span', {
    style: {
      position: 'absolute',
      right: s.iconOffset,
      top: '50%',
      transform: 'translateY(-50%)',
      color: 'var(--color-text-tertiary)',
      display: 'flex',
      pointerEvents: 'none'
    }
  }, React.createElement('svg', {
    width: s.iconSize,
    height: s.iconSize,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round'
  }, iconRight))), (hint || error) && React.createElement('p', {
    style: {
      margin: 0,
      fontSize: 'var(--text-xs)',
      fontFamily: 'var(--font-sans)',
      color: error ? 'var(--color-error)' : 'var(--color-text-secondary)',
      lineHeight: 'var(--leading-normal)'
    }
  }, error || hint));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/Switch.jsx
try { (() => {
/**
 * Switch — Toggle control. Spring-animated thumb.
 * Perfect for automation on/off controls.
 */
function Switch({
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
    sm: {
      trackW: 30,
      trackH: 18,
      thumbS: 14,
      offset: 2,
      onOffset: 14
    },
    md: {
      trackW: 44,
      trackH: 26,
      thumbS: 20,
      offset: 3,
      onOffset: 21
    },
    lg: {
      trackW: 56,
      trackH: 32,
      thumbS: 26,
      offset: 3,
      onOffset: 27
    }
  };
  const d = dims[size];
  const trackStyle = {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    width: d.trackW + 'px',
    height: d.trackH + 'px',
    borderRadius: 'var(--radius-full)',
    background: checked ? 'linear-gradient(135deg, var(--color-sky-400), var(--color-sky-500))' : 'var(--color-neutral-300)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'background var(--duration-base) var(--ease-out)',
    flexShrink: 0,
    boxShadow: checked ? 'var(--shadow-sky-sm)' : 'var(--shadow-inset-sm)',
    opacity: disabled ? 0.5 : 1,
    outline: 'none',
    border: 'none'
  };
  const thumbStyle = {
    position: 'absolute',
    width: d.thumbS + 'px',
    height: d.thumbS + 'px',
    borderRadius: '50%',
    background: '#ffffff',
    top: d.offset + 'px',
    left: (checked ? d.onOffset : d.offset) + 'px',
    transition: 'left var(--duration-base) var(--ease-spring)',
    boxShadow: '0 1px 4px rgba(0,0,0,0.22), 0 0 0 0.5px rgba(0,0,0,0.06)',
    pointerEvents: 'none'
  };
  const labelFontSize = size === 'sm' ? 'var(--text-sm)' : size === 'lg' ? 'var(--text-md)' : 'var(--text-base)';
  const handleClick = () => {
    if (!disabled) onChange && onChange(!checked);
  };
  const handleKey = e => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      handleClick();
    }
  };
  return React.createElement('div', {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 'var(--space-3)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      userSelect: 'none',
      flexDirection: labelPosition === 'left' ? 'row-reverse' : 'row',
      ...style
    },
    ...rest
  }, React.createElement('div', {
    style: trackStyle,
    onClick: handleClick,
    onKeyDown: handleKey,
    role: 'switch',
    'aria-checked': checked,
    tabIndex: disabled ? -1 : 0
  }, React.createElement('div', {
    style: thumbStyle
  })), (label || hint) && React.createElement('div', {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '2px'
    }
  }, label && React.createElement('span', {
    style: {
      fontSize: labelFontSize,
      fontFamily: 'var(--font-sans)',
      fontWeight: 'var(--weight-medium)',
      color: 'var(--color-text-primary)',
      lineHeight: 1.2
    }
  }, label), hint && React.createElement('span', {
    style: {
      fontSize: 'var(--text-xs)',
      fontFamily: 'var(--font-sans)',
      color: 'var(--color-text-secondary)',
      lineHeight: 1.3
    }
  }, hint)));
}
Object.assign(__ds_scope, { Switch });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Switch.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Tag = __ds_scope.Tag;

__ds_ns.Stat = __ds_scope.Stat;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Switch = __ds_scope.Switch;

})();
