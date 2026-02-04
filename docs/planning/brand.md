> Reference branding guide for kredit.truestack.my.
> Follows the TrueStack brand identity from www.truestack.my with blue accent colors and light/dark theme support.

---

## 1) Brand Name & Domain

- **Product name:** TrueKredit
- **Domain:** [kredit.truestack.my](http://kredit.truestack.my/)

---

## 2) Typography

### Fonts

- **Headings:** Rethink Sans
- **Body:** Inter

### Usage

- Use Rethink Sans for all headings, section titles, and numbers in KPI cards.
- Use Inter for body text, labels, and table content.

---

## 3) Color System (Light & Dark Theme + Blue Accent)

### Light Theme

- **Background:** #FFFFFF (primary canvas)
- **Background Tint:** Subtle blue gradient overlay (3% opacity) for content areas
- **Surface:** #F8FAFC (cards, panels)
- **Border:** #E2E8F0
- **Text Primary:** #0F172A
- **Text Secondary:** #64748B

### Dark Theme

- **Background:** #0F172A (primary canvas)
- **Background Tint:** Subtle blue gradient overlay (3% opacity) for content areas
- **Surface:** #1E293B (cards, panels)
- **Border:** #334155
- **Text Primary:** #F8FAFC
- **Text Secondary:** #94A3B8

### Accent (Blue - TrueStack Brand)

- **Primary Blue:** #3B82F6
- **Gradient start:** #3B82F6
- **Gradient end:** #2563EB
- **Use for:** primary buttons, highlights, progress, graphs, badges, links

### Status colors

- **Success:** #22C55E
- **Warning:** #F59E0B
- **Error:** #EF4444
- **Info:** #3B82F6

---

## 4) Component Styling (ShadCN UI)

### Buttons

- Primary button: blue gradient background, white text
- Secondary button: surface background + blue border

### Cards

- Surface background (adapts to theme)
- Soft border
- Subtle shadow

### Tables

- Compact rows
- Sticky header
- Zebra striping with subtle contrast

### Inset Panels / Filter Bars

For inset sections within cards (e.g., filter bars, toolbars, inline controls), use a distinct background that stands out from the card surface:

| Theme | Background | Border |
|-------|------------|--------|
| **Light** | `bg-slate-100` (#F1F5F9) | `border-slate-200` (#E2E8F0) |
| **Dark** | `bg-slate-800/50` | `border-slate-700` (#334155) |

**Tailwind classes:**
```html
<div class="bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
  <!-- Filter controls, toolbars, etc. -->
</div>
```

**Why:** The default `bg-muted/50` is too subtle in light mode and lacks sufficient contrast against card surfaces. Using explicit slate colors ensures visibility in both themes.

---

## 5) Iconography & Visuals

- Use minimal, sharp icons (Lucide or similar).
- Avoid heavy illustrative graphics; prioritize clarity and utility.

---

## 6) Layout & Spacing

- 8pt spacing scale
- Left-side navigation for admin
- Content areas centered with max width
- Use cards for grouped data
- Main content area uses subtle blue tint gradient (`bg-tint` or `bg-tint-subtle` utility classes)

---

## 7) Example CSS Tokens

```css
:root {
  /* Light theme */
  --color-bg: #FFFFFF;
  --color-surface: #F8FAFC;
  --color-border: #E2E8F0;
  --color-text: #0F172A;
  --color-muted: #64748B;
  --color-accent-start: #3B82F6;
  --color-accent-end: #2563EB;
}

.dark {
  /* Dark theme */
  --color-bg: #0F172A;
  --color-surface: #1E293B;
  --color-border: #334155;
  --color-text: #F8FAFC;
  --color-muted: #94A3B8;
  --color-accent-start: #3B82F6;
  --color-accent-end: #2563EB;
}
```

---

## 8) Do / Don't

### Do

- Use blue accents for key calls-to-action.
- Keep layout clean and data dense.
- Maintain strong contrast for accessibility.
- Support both light and dark themes.

### Don't

- Overuse gradients on all components.
- Mix brand colors with other accent colors.
