Pill-shaped button for all PWA interactive controls — primary CTA, secondary accent, and low-emphasis ghost variants.

```jsx
// Primary CTA
<Button variant="primary" size="md">Monitor System</Button>

// With leading icon (pass SVG path data as icon)
<Button variant="secondary" icon={<svg>…</svg>}>View Analytics</Button>

// Loading state
<Button variant="primary" loading>Connecting…</Button>

// Ghost / low emphasis
<Button variant="ghost" size="sm">Cancel</Button>

// Danger
<Button variant="danger">Shut Down System</Button>
```

**Variants:** primary (navy gradient) · secondary (sky gradient) · ghost (border) · outline (navy stroke) · outline-sky · danger · text
**Sizes:** xs (28px) · sm (34px) · md (42px) · lg (52px) · xl (62px)
**Notable:** `loading` prop shows spinner and disables click. `href` renders as `<a>`. `fullWidth` stretches to container. `icon` / `iconRight` accept any React node.
