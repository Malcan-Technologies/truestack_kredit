> Reference branding guide for kredit.truestack.my.
> Neutral black/gray theme inspired by Vercel/Resend. Color is reserved for status indicators and data.

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

### Size Scale (increased for readability)

| Role | Size | Notes |
|------|------|-------|
| Page headings | `text-3xl` (30px) | Main page titles |
| Section headings | `text-xl` (20px) | Card titles, section headers |
| Body / table text | `text-base` (16px) | Default readable size |
| Labels / metadata | `text-sm` (14px) | Form labels, helper text |
| Small metadata | `text-xs` (12px) | Badges, timestamps |
| Chart axis text | `fontSize={13}` | Recharts axis labels |

---

## 3) Color System (Neutral Black / Gray)

### Light Theme

- **Background:** #FFFFFF (pure white)
- **Surface:** #FAFAFA (cards, panels)
- **Border:** #E5E5E5 (neutral gray)
- **Text Primary:** #0A0A0A (near-black)
- **Text Secondary:** #737373 (medium gray)

### Dark Theme

- **Background:** #0A0A0A (near-black)
- **Surface:** #171717 (dark gray cards)
- **Border:** #292929 (subtle borders)
- **Text Primary:** #FAFAFA (near-white)
- **Text Secondary:** #8C8C8C (medium gray)

### Primary (Neutral)

- Light mode: near-black buttons/CTAs with white text
- Dark mode: white/near-white buttons/CTAs with dark text
- **Use for:** primary buttons, interactive highlights, focus rings

### Status Colors (the ONLY source of color in the UI)

- **Success:** #22C55E (green)
- **Warning:** #F59E0B (amber)
- **Error:** #EF4444 (red)
- **Info:** #3B82F6 (blue)

### Design Principle

> The chrome is invisible. Color is reserved exclusively for meaning.
> Status badges, alerts, and data visualizations are the only places color appears.
> This ensures instant visual clarity in a data-dense admin interface.

---

## 4) Component Styling (ShadCN UI)

### Buttons

- Primary button: solid dark/light background (adapts to theme), contrasting text
- Secondary button: surface background + border
- Ghost button: transparent, text only

### Cards

- Surface background (adapts to theme)
- Subtle border (no shadow in dark mode)
- Clean, flat appearance

### Tables

- Compact rows
- Sticky header
- Subtle hover state with `bg-surface/50`

### Inset Panels / Filter Bars

For inset sections within cards (e.g., filter bars, toolbars, inline controls):

| Theme | Background | Border |
|-------|------------|--------|
| **Light** | `bg-neutral-100` (#F5F5F5) | `border-neutral-200` (#E5E5E5) |
| **Dark** | `bg-neutral-800/50` | `border-neutral-700` (#404040) |

**Tailwind classes:**
```html
<div class="bg-neutral-100 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700">
  <!-- Filter controls, toolbars, etc. -->
</div>
```

---

## 5) Iconography & Visuals

- Use minimal, sharp icons (Lucide or similar).
- Avoid heavy illustrative graphics; prioritize clarity and utility.
- Icons use `text-muted-foreground` by default, NOT colored unless indicating status.

---

## 6) Layout & Spacing

- 8pt spacing scale
- Left-side navigation for admin
- Content areas use flat backgrounds (no gradients on chrome)
- Use cards for grouped data
- No background tint gradients on main content area

---

## 7) Example CSS Tokens

```css
:root {
  /* Light theme */
  --color-bg: #FFFFFF;
  --color-surface: #FAFAFA;
  --color-border: #E5E5E5;
  --color-text: #0A0A0A;
  --color-muted: #737373;
}

.dark {
  /* Dark theme */
  --color-bg: #0A0A0A;
  --color-surface: #171717;
  --color-border: #292929;
  --color-text: #FAFAFA;
  --color-muted: #8C8C8C;
}
```

---

## 8) Do / Don't

### Do

- Reserve color exclusively for status indicators and data visualizations.
- Keep layout clean and data dense.
- Maintain strong contrast for accessibility.
- Support both light and dark themes.
- Use typography (weight, size, spacing) for hierarchy instead of color.

### Don't

- Use colored accents for chrome/navigation/buttons.
- Add gradient overlays on backgrounds.
- Mix decorative color with status color.
- Use blue for both "info status" and "active navigation item."
