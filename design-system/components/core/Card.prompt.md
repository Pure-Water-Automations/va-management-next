Content container for all card-based layouts in PWA — feature cards, KPI panels, settings groups, dashboard widgets.

```jsx
// Standard card
<Card padding="md">
  <h3>Filtration System A</h3>
  <p>Operational · 12.4 L/min</p>
</Card>

// Dark navy hero card
<Card variant="navy" padding="lg">
  <span>Water Quality Index</span>
  <strong>98.4</strong>
</Card>

// Glass overlay (use over imagery or dark backgrounds)
<Card variant="glass" padding="md">Live readings</Card>

// Clickable / hoverable card
<Card hoverable onClick={() => navigate('/system/1')}>…</Card>
```

**Variants:** default · elevated · glass · navy · sky · flat · outline
**Padding:** none · xs · sm · md · lg · xl
**Radius:** sm (16px) · md (20px) · card (24px) · lg (32px)
**Notable:** `onClick` or `hoverable` enables the lift-on-hover animation. `navy` and `sky` variants set `color: white` — child text inherits unless overridden.
