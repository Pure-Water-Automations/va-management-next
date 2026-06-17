Category and filter labels for PWA dashboards, search results, and system classifications.

```jsx
// Filter chips
<Tag variant="sky">Filtration</Tag>
<Tag variant="primary">Zone A</Tag>
<Tag variant="default">Offline</Tag>

// Selected/removable filter
<Tag variant="sky" removable onRemove={() => setFilter(null)}>
  Pressure: High
</Tag>

// Status classification
<Tag variant="danger" size="sm">Critical</Tag>
<Tag variant="success" size="sm">Certified</Tag>
```

**Variants:** default · primary · sky · success · warning · danger · outline · solid
**Sizes:** sm · md · lg
**Notable:** `removable` adds a × button. Tags use rectangular corners (8px); use Badge for pill-shaped status indicators.
