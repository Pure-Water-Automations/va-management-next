Text input for PWA forms — system configuration, search, login, alert settings.

```jsx
// Basic with label
<Input label="System Name" placeholder="e.g. Filtration Unit A" />

// With icon (SVG path passed as prop)
<Input
  label="Search systems"
  icon={<><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></>}
  placeholder="Search…"
/>

// Error state
<Input
  label="Flow Rate Threshold"
  value="999"
  error="Must be between 0 and 500 L/min"
/>

// Hint text
<Input
  label="Alert Email"
  type="email"
  hint="Receives critical system alerts"
/>

// Disabled
<Input label="Device ID" value="SYS-00142" disabled />
```

**Sizes:** sm (34px) · md (42px) · lg (52px)
**Notable:** Sky-blue focus ring. `icon` / `iconRight` accept `<path>` SVG elements rendered in a 24×24 wrapper. `error` takes priority over `hint`.
