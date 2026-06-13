/**
 * Stat — KPI metric card with value, label, trend indicator, and optional icon.
 * Core building block for PWA monitoring dashboards.
 */
export function Stat({
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
    up:      'var(--color-success)',
    down:    'var(--color-error)',
    neutral: 'var(--color-text-secondary)',
  };
  const trendBgs = {
    up:      'var(--color-success-light)',
    down:    'var(--color-error-light)',
    neutral: 'var(--color-neutral-100)',
  };

  const isNavy = variant === 'navy';
  const isSky  = variant === 'sky';
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
      boxShadow: 'var(--shadow-navy-md)',
    } : isSky ? {
      background: 'linear-gradient(145deg, var(--color-sky-400) 0%, var(--color-sky-500) 100%)',
      border: '1px solid rgba(255,255,255,0.2)',
      boxShadow: 'var(--shadow-sky-md)',
    } : {
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      boxShadow: 'var(--shadow-sm)',
    }),
    ...style,
  };

  const trendArrow = trend === 'up'
    ? React.createElement('svg', { width: 10, height: 10, viewBox: '0 0 10 10', fill: 'none' },
        React.createElement('path', { d: 'M5 8L2 4.5h6L5 8Z', fill: 'currentColor', transform: 'rotate(180 5 5)' })
      )
    : trend === 'down'
    ? React.createElement('svg', { width: 10, height: 10, viewBox: '0 0 10 10', fill: 'none' },
        React.createElement('path', { d: 'M5 2L8 5.5H2L5 2Z', fill: 'currentColor', transform: 'rotate(180 5 5)' })
      )
    : null;

  return React.createElement(
    'div', { style: containerStyle, ...rest },

    /* Header row */
    React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
      React.createElement('span', {
        style: {
          fontSize: 'var(--text-sm)', fontFamily: 'var(--font-sans)',
          fontWeight: 'var(--weight-medium)', letterSpacing: '0.01em',
          color: isDark ? 'rgba(255,255,255,0.7)' : 'var(--color-text-secondary)',
        },
      }, label),
      icon && React.createElement('span', {
        style: {
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: '36px', height: '36px', borderRadius: 'var(--radius-md)',
          background: isDark ? 'rgba(255,255,255,0.14)' : 'var(--color-sky-50)',
          color: isDark ? 'rgba(255,255,255,0.9)' : 'var(--color-sky-500)',
          flexShrink: 0,
        },
      }, icon)
    ),

    /* Value row */
    React.createElement('div', { style: { display: 'flex', alignItems: 'baseline', gap: 'var(--space-1-5)' } },
      React.createElement('span', {
        style: {
          fontSize: 'var(--text-4xl)', fontFamily: 'var(--font-display)',
          fontWeight: 'var(--weight-bold)', letterSpacing: 'var(--tracking-tight)',
          lineHeight: 1,
          color: isDark ? '#ffffff' : 'var(--color-text-primary)',
        },
      }, value),
      unit && React.createElement('span', {
        style: {
          fontSize: 'var(--text-lg)', fontFamily: 'var(--font-sans)',
          fontWeight: 'var(--weight-medium)',
          color: isDark ? 'rgba(255,255,255,0.55)' : 'var(--color-text-secondary)',
        },
      }, unit)
    ),

    /* Trend row */
    (change !== undefined || changeLabel) && React.createElement(
      'div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)' } },
      change !== undefined && React.createElement('span', {
        style: {
          display: 'inline-flex', alignItems: 'center', gap: '3px',
          background: isDark ? 'rgba(255,255,255,0.15)' : trendBgs[trend],
          color: isDark ? 'rgba(255,255,255,0.9)' : trendColors[trend],
          padding: '2px 8px', borderRadius: 'var(--radius-full)',
          fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-semibold)',
          fontFamily: 'var(--font-sans)',
        },
      }, trendArrow, change),
      changeLabel && React.createElement('span', {
        style: {
          fontSize: 'var(--text-xs)', fontFamily: 'var(--font-sans)',
          color: isDark ? 'rgba(255,255,255,0.45)' : 'var(--color-text-tertiary)',
        },
      }, changeLabel)
    )
  );
}
