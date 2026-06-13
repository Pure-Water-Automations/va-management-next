KPI metric card for PWA monitoring dashboards — water quality, flow rate, pressure, system uptime.

```jsx
// Standard metric
<Stat
  label="Flow Rate"
  value="12.4"
  unit="L/min"
  change="+0.8"
  changeLabel="vs. last hour"
  trend="up"
/>

// Water quality with icon
<Stat
  label="Water Quality Index"
  value="98.4"
  unit="%"
  change="+1.2%"
  trend="up"
  icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2C6 9 4 13 4 15a8 8 0 0016 0c0-2-2-6-8-13z"/></svg>}
/>

// Dark navy variant
<Stat variant="navy" label="Active Systems" value="7" changeLabel="All operational" />

// Down trend (fault)
<Stat
  label="Pressure"
  value="2.1"
  unit="bar"
  change="-0.4"
  trend="down"
  changeLabel="Below threshold"
/>
```

**Variants:** default (white card) · navy (dark gradient) · sky (accent gradient)
**Notable:** `trend` sets the badge color (up=green, down=red, neutral=gray). Use in a CSS grid for side-by-side dashboards.
