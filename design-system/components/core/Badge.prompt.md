Status chip for system states, sensor classifications, and categorical labels in PWA UIs.

```jsx
// System status with animated dot
<Badge variant="success" dot pulse>Online</Badge>
<Badge variant="danger" dot>Fault Detected</Badge>
<Badge variant="warning" dot>Maintenance Due</Badge>

// Category labels
<Badge variant="sky">Filtration</Badge>
<Badge variant="primary" size="sm">Zone A</Badge>

// Solid / inverse
<Badge variant="solid">Active</Badge>
<Badge variant="solid-sky">Live</Badge>
```

**Variants:** default · primary · sky · success · warning · danger · info · solid · solid-sky · outline
**Sizes:** sm (18px) · md (22px) · lg (28px)
**Notable:** `dot` adds a status circle. `pulse` animates it — ideal for live/active system indicators. Never use emoji as status indicators.
