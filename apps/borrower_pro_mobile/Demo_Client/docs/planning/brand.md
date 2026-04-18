# Demo_Client Mobile — Branding Guide

Reference branding for **Demo_Client** — the mobile (Expo/React Native) borrower app for TrueKredit Pro. Mirrors the web borrower portal (`apps/borrower_pro/Demo_Client/docs/planning/brand.md`) and adds mobile-specific guidance. Each Pro client can override via `src/brand/clients/<id>.ts`.

---

## ⚠️ Do NOT Hardcode Colors

**Never use raw hex codes** in components. All brand colors are defined in `src/brand/clients/demo-client.ts` and exposed through the semantic `Colors` map in `src/constants/theme.ts`.

| Use this | Not this |
|----------|----------|
| `theme.error` via `useTheme()` | `'#EF4444'` or `'red'` |
| `theme.success` | `'#22C55E'` or `'green'` |
| `theme.primary` | `'#FAFAFA'` or `'#171717'` |
| `theme.textSecondary` | `'gray'` or `'#737373'` |

---

## 1) Client Identity

- **Client name**: Demo Client
- **Product**: Digital license KPKT borrowing
- **App name**: Demo Client (configured in `app.config.ts`)
- **Scheme**: `demo-client` (deep link scheme)

---

## 2) Typography

### Fonts

| Platform | Display / Headings | Body | Monospace |
|----------|-------------------|------|-----------|
| iOS | `system-ui` (SF Pro) | `system-ui` (SF Pro) | `ui-monospace` (SF Mono) |
| Android | System default | System default | System monospace |
| Web | Spline Sans, Inter | Spline Sans, Inter | SFMono-Regular, Menlo |

On native, the app uses platform system fonts to feel native. On web, custom fonts are loaded via CSS variables in `src/global.css`.

### Type Scale (`ThemedText` variants)

| Variant | Size | Weight | Line Height | Use Case |
|---------|------|--------|-------------|----------|
| `title` | 48px | 600 | 52 | Hero / splash text (rare) |
| `subtitle` | 32px | 600 | 44 | Section headings (rare) |
| `default` | 16px | 500 | 24 | Body text, form inputs |
| `small` | 14px | 500 | 20 | Labels, metadata, captions |
| `smallBold` | 14px | 700 | 20 | Card titles, section headers |
| `link` | 14px | 400 | 30 | Tappable text links |
| `linkPrimary` | 14px | 400 | 30 | Links colored with `primary` |
| `code` | 12px | 500/700 | — | Code / mono snippets |

### Page Titles (PageScreen)

- **Root screens** (tab destinations, no back button): titles use animated sizing — **30px** at rest, shrinking to **17px** on scroll — with `fontWeight: 600`, matching the iOS large-title style.
- **Stack screens** (drill-down, `showBackButton`): a single **compact bar** with back + **centered** title at **17px** (`fontWeight: 600`). The borrower profile switcher is not shown on these screens — it only appears on root screens.

---

## 3) Color System

All tokens live in `src/brand/clients/demo-client.ts` → `src/constants/theme.ts`.

### Dark Theme (Default)

| Token | Hex | Usage |
|-------|-----|-------|
| `background` | #0A0A0A | App/page background |
| `surface` (`backgroundElement`) | #171717 | Cards, tab bar, inputs |
| `surfaceSelected` (`backgroundSelected`) | #2E3135 | Active tab, selected states |
| `border` | #292929 | Card borders, dividers |
| `text` | #FAFAFA | Primary text |
| `textSecondary` | #8C8C8C | Labels, captions, inactive tabs |
| `primary` | #FAFAFA | CTAs, active tab icons, links |
| `primaryForeground` | #0A0A0A | Text on primary surfaces |

### Light Theme

| Token | Hex | Usage |
|-------|-----|-------|
| `background` | #FFFFFF | App/page background |
| `surface` (`backgroundElement`) | #FAFAFA | Cards, tab bar, inputs |
| `surfaceSelected` (`backgroundSelected`) | #E5E5E5 | Active tab, selected states |
| `border` | #E5E5E5 | Card borders, dividers |
| `text` | #0A0A0A | Primary text |
| `textSecondary` | #737373 | Labels, captions, inactive tabs |
| `primary` | #171717 | CTAs, active tab icons, links |
| `primaryForeground` | #FAFAFA | Text on primary surfaces |

### Status Colors (same in both themes)

| Token | Hex | Semantic | Usage |
|-------|-----|----------|-------|
| `success` | #22C55E | Green | Approved, completed, verified |
| `warning` | #F59E0B | Amber | Pending, attention needed |
| `error` | #EF4444 | Red | Rejected, failed, destructive |
| `info` | #3B82F6 | Blue | Informational, tips |

---

## 4) Spacing System

Defined in `src/constants/theme.ts`:

| Token | Value | Common Use |
|-------|-------|------------|
| `Spacing.half` | 2px | Hairline gaps |
| `Spacing.one` | 4px | Icon-label gaps, tight padding |
| `Spacing.two` | 8px | Inner card padding, between items |
| `Spacing.three` | 16px | Card padding, section gaps |
| `Spacing.four` | 24px | Page horizontal padding, major gaps |
| `Spacing.five` | 32px | Large breathing room |
| `Spacing.six` | 64px | Hero spacing (rare) |

---

## 5) Component Styling

### Cards (`SectionCard`)

- `borderRadius: 16` — consistently rounded.
- `borderWidth: 1` with `theme.border`.
- `padding: Spacing.three` (16px) inner padding.
- Background: `theme.backgroundElement`.

### Buttons (`PageHeaderToolbarButton`)

- `borderRadius: 12` — pill-shaped.
- Min height: 34px.
- Horizontal padding: 10px (`Spacing.two + 2`).
- Variants: `primary` (filled), `outline` (ghost), `danger` (red filled).
- Pressed/disabled opacity: 0.75.

### Back Button

- iOS: On **iOS 26+** with Liquid Glass available, the chevron sits in an **`expo-glass-effect` `GlassView`** (`UIGlassEffect`, ~44×44 capsule). Otherwise: SF Symbol `chevron.backward` (or older iOS: `chevron.left` / vector fallback), colored with `theme.primary`.
- Android / web: Material `arrow-back` only, colored with `theme.primary`.

### Badges & Pills

We have three badge components and use each for a specific job. **Pick the one
whose visual weight matches the meaning of the data — don't reach for tonal
status colour just because the field happens to be a status.**

| Component | When to use | Visual recipe |
|-----------|-------------|---------------|
| **`MetaBadge`** (`@/components/meta-badge`) | **Default** for any chip that sits below a screen title or inside a list/detail row to label a *property* — status, channel, schedule type, repayment row state, borrower type, etc. Uniform neutral look so multiple chips read as one row of metadata. | `backgroundColor: theme.backgroundSelected`, `borderColor: theme.border`, text + optional 14pt `MaterialIcons` in `theme.textSecondary`, pill-shaped (`borderRadius: 999`, `paddingHorizontal: Spacing.two`, `paddingVertical: 4`). Differentiate badges by **icon + label**, not colour. |
| **`StatusBadge`** (`@/components/status-badge`) | Rare. Use **only** when the badge stands alone (no neighbouring chips) and tonal colour is itself the message — e.g. a single "Verified" pill on a profile card, or a tonal "Approved" tag in a dense activity log. | Tonal `borderColor` + `theme.backgroundSelected` fill (or light-success tint). |
| **`ChannelPill`** (`@/components/channel-pill`) | Compact list rows where a coloured Online/Physical pill is a meaningful at-a-glance signal and the row is the primary visual unit (e.g. loan list cards). Not used in title-row badges (use `MetaBadge` there). | Tonal blue for `ONLINE`, neutral surface for `PHYSICAL`, with `apartment` / `computer` icon. |

**Rule of thumb**: title-row badges (status / channel / Jadual / etc.), and
multi-chip metadata strips inside cards (e.g. each repayment row's status),
**must** use `MetaBadge`. Only fall back to `StatusBadge` when a single
coloured pill needs to communicate state by itself.

---

## 6) White-Label Customization

When creating a new Pro client:

1. Copy `src/brand/clients/demo-client.ts` → `src/brand/clients/<new-id>.ts`.
2. Update colors, `displayName`, `productTagline`.
3. Point `src/brand/active.ts` at the new client module.
4. Update `app.config.ts` for app name, scheme, bundle IDs, icons.
5. Replace assets in `assets/images/` (splash, icon, favicon).
6. All components inherit the new palette automatically via `useTheme()`.
