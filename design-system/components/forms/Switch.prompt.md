Toggle switch for automation on/off controls — filtration systems, alert triggers, feature flags.

```jsx
// Controlled switch with label
const [active, setActive] = React.useState(true);
<Switch checked={active} onChange={setActive} label="Auto-flush enabled" />

// With hint text
<Switch
  checked={notifications}
  onChange={setNotifications}
  label="Email alerts"
  hint="Notifies on critical threshold breach"
/>

// Sizes
<Switch size="sm" checked label="Compact" />
<Switch size="lg" checked label="Large control" />

// Label on left
<Switch labelPosition="left" checked label="Active" />

// Disabled
<Switch disabled checked label="Locked setting" />
```

**Sizes:** sm (30×18px) · md (44×26px) · lg (56×32px)
**Notable:** Sky gradient when `checked`. Spring easing on the thumb. Fully keyboard accessible (Space/Enter to toggle). Perfect for automation control panels.
