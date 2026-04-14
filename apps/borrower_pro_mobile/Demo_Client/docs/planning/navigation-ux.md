# Demo_Client Mobile — Navigation & UX Guidelines

Best practices for navigation, button placement, and interaction design in the borrower mobile app. Benchmarked against **iOS Human Interface Guidelines (HIG)** and industry-standard fintech apps (banking, lending, payments).

---

## 1) Navigation Architecture

### Tab Bar (Primary Navigation)

The app uses a **5-tab bottom tab bar** — the standard iOS/Android pattern for top-level destinations.

| Tab | Icon (SF Symbol) | Icon (Material) | Purpose |
|-----|-----------------|-----------------|---------|
| Dashboard | `house` | `home` | Home / overview |
| Applications | `doc.text` | `description` | Loan applications |
| Loans | `banknote` | `account_balance_wallet` | Active loans |
| Profile | `person.text.rectangle` | `badge` | Borrower profile |
| Settings | `gearshape` | `settings` | Account & app settings |

**Rules:**

- **Maximum 5 tabs.** Apple HIG recommends 3–5. More than 5 requires a "More" tab, which degrades discoverability.
- **Tab labels are mandatory.** Icon-only tabs are ambiguous — always pair with a short label (1 word preferred, 2 max).
- **Tab icons must be filled when active**, outlined when inactive. This matches iOS and Material 3 conventions.
- **Active tab** uses `primary` color; inactive tabs use `textSecondary`.
- **Tab bar is always visible** on all primary screens. Never hide it to prevent disorientation.
- **Tab bar persists context.** Switching tabs should not reset scroll position or form state within each tab's stack.

### Stack Navigation (Drill-Down)

Sub-screens (detail views, forms, settings pages) push onto a **stack** within each tab context.

**Rules:**

- **Back button placement:** Always top-left. iOS: SF Symbol `chevron.backward` (native, minimal style); Android: Material arrow-back (no label).
- **Stack screens hide the tab bar.** When navigating deeper (e.g. loan detail, profile edit, help article), the tab bar disappears. This signals the user is "inside" a flow.
- **Never nest tabs inside tabs.** Use a flat list, segmented controls, or filter chips for sub-categorization within a tab.
- **Deep links** should resolve to the correct stack position with a proper back path to the parent tab.

---

## 2) Header / Navigation Bar Design

### Root vs stack screens (`PageScreen`)

| Mode | `showBackButton` | Title layout | Profile switcher |
|------|-------------------|--------------|------------------|
| **Root** (tab destinations) | `false` | Large title (30px → 17px on scroll) + optional subtitle; actions on the right | **Shown** when `showBorrowerContextHeader` |
| **Stack** (drill-down) | `true` | **Single row**: back (left) + **title centered** (17px) + optional `headerActions` (right). The `subtitle` prop is not shown (root screens only). | **Never** — `showBorrowerContextHeader` is ignored when `showBackButton` is true |

**Rules:**

- **Stack screens** match the native pushed-screen pattern: back control and title share one horizontal bar; the title is centered between fixed-width left/right slots so it stays visually centered even when only one side has content.
- **Do not pass** `showBorrowerContextHeader` on stack screens — the borrower profile switcher belongs only on root tab screens.
- **Root screens** use the large-title pattern (see below) and may show the profile switcher next to lightweight header actions.

### Large Title Pattern (root screens only)

On **`showBackButton: false`**, the app implements the iOS **large title → compact title** animation for content-heavy primary screens.

| State | Title Size | Behavior |
|-------|-----------|----------|
| At rest (scroll top) | 30px, bold | Large title in the header area |
| Scrolled | 17px, bold | Collapses toward the compact inline title |

**Rules:**

- **Use large titles on primary tab screens** (Dashboard, Applications, Loans, Profile, Settings). They establish context.
- **Subtitles** fade out on scroll for a cleaner compressed header.
- **Header hairline** under the bar appears as the user scrolls (animated opacity).

### Header vertical spacing

All screens that use **`PageScreen`** share the same top chrome. Vertical padding is tuned so the title row does not feel cramped under the status bar and there is comfortable space before the hairline / scroll content. Implementation lives in `src/components/page-screen.tsx`:

- **`headerInner`** — padding below the top safe area and before the separator hairline.
- **Root (large title)** — `headerToolbar`: margin above the title block, padding below title/subtitle; subtitle uses a slightly larger top gap when visible.
- **Stack (compact bar)** — `compactNavBar`: padding below the back + centered title row only (no subtitle line).

Adjust these tokens when changing global header density; avoid one-off top padding on individual screens unless there is a strong reason.

### Header Actions

**Root screens:** actions sit to the **right** of the large title row (same row as title when compact), alongside the profile switcher when enabled.

**Stack screens:** optional `headerActions` sit in the **trailing** fixed-width column of the compact bar (same row as back + centered title).

| Placement | What goes here | Examples |
|-----------|---------------|----------|
| **Leading** | Back control | Chevron / arrow only (stack only) |
| **Center** | Page title | Centered on stack; left-aligned large title on root |
| **Trailing** | Profile switcher (root only), lightweight actions | Avatar, Retry |

**Rules:**

- **Keep the header minimal.** Prefer 0–1 header actions. Move contextual actions (Edit, Save) into the page body instead.
- **Use `PageHeaderToolbarButton`** only for lightweight header actions (e.g. Retry on error) — never for primary CTAs.
- **Destructive actions** (Sign out, Delete) must NEVER be in the header. Place them at the bottom of the page body.
- **Edit/Save/Cancel patterns** belong inline in their section card or in a sticky bottom bar, not in the header. This keeps the header clean and improves thumb reachability on long forms.

---

## 3) Button Placement & Hierarchy

### Primary Actions

| Context | Placement | Style |
|---------|-----------|-------|
| **Page-level CTA** (e.g. "Apply for Loan", "Submit") | Bottom of page content OR sticky bottom bar | Full-width filled button, `primary` color |
| **Contextual action** (e.g. "Edit Profile") | Inline tappable row inside the content card | Row with icon + label + chevron |
| **Form submission** (e.g. "Save", "Continue") | Sticky bottom bar via `PageScreen` `stickyFooter` | Full-width filled button, `primary` color |
| **Section edit** (e.g. "Edit" on account info) | Card header action via `SectionCard` `action` prop | Outline button in card top-right |
| **Destructive** (e.g. "Sign out") | Bottom of page content, full-width | Danger variant button |

### Button Hierarchy (iOS/Material Standard)

1. **Primary (filled):** One per screen. The main action. `primary` background, `primaryForeground` text.
2. **Secondary (outline/ghost):** Supporting actions. `outline` variant — border with no fill.
3. **Tertiary (text/link):** Low-emphasis. Use `linkPrimary` ThemedText or plain tappable text.
4. **Destructive:** Red filled (`danger` variant). Always requires confirmation (alert/dialog).

**Rules:**

- **One primary CTA per screen.** If two actions compete, one must be secondary.
- **Place the primary action at the bottom** for thumb reachability (Fitts's Law). This is the natural resting position on mobile.
- **Use `PageScreen`'s `stickyFooter` prop** for form screens (edit profile, loan application, etc.). This renders a fixed action bar above the safe area at the bottom of the screen.
- **Inline edit buttons** should use a tappable row pattern (icon + label + chevron-right) inside the content card, not a header pill. This is contextual and discoverable.
- **On edit screens, back button = cancel.** No explicit "Cancel" button needed — the native back gesture / back button serves as cancel (standard iOS pattern).
- **Never place destructive actions next to primary actions** without visual separation.
- **Minimum touch target: 44x44pt** (iOS HIG). Current `minHeight: 34` on toolbar buttons is acceptable because horizontal padding compensates, but full buttons should be ≥44pt tall.

---

## 4) Touch Targets & Interaction

### Sizing

| Element | Minimum Size | Recommended |
|---------|-------------|-------------|
| Buttons | 44x44pt | 48x48pt for primary actions |
| Tab bar items | 44x44pt | Current `minWidth: 72` is good |
| List rows | 44pt height | 48–56pt for comfortable tapping |
| Icon buttons | 44x44pt | Even if icon is 20px, hit area must be 44pt |

### Feedback

| Interaction | Feedback | Implementation |
|-------------|----------|----------------|
| Tap | Opacity change (0.75) | `Pressable` + `opacity` in `style` callback |
| Long press | — | Reserve for secondary actions (copy, share) |
| Swipe | — | Swipe-to-delete or swipe actions on list rows (future) |
| Pull to refresh | Spinner | On scrollable lists (Dashboard, Loans, Applications) |

**Rules:**

- **Always provide visual feedback on press.** The current 0.75 opacity pattern is correct.
- **Avoid double-tap.** Single tap should always suffice.
- **Disable buttons during async operations.** Show `ActivityIndicator` inside the button (already implemented in `PageHeaderToolbarButton`).
- **Use `keyboardShouldPersistTaps="handled"`** on ScrollViews containing forms (already implemented in `PageScreen`).

---

## 5) Cards & Content Containers

### SectionCard Pattern

The primary content container is `SectionCard` — a bordered, rounded card.

**Rules:**

- **16px border radius** consistently across all cards.
- **16px internal padding** (`Spacing.three`).
- **16px gap** between cards in a page.
- **Card titles** use `smallBold` (14px/700) — not heading sizes. This keeps density appropriate for mobile.
- **Card actions** (edit, expand) sit at the **top-right** of the card header.
- **Collapsible cards** should use the chevron affordance (expand-more/expand-less) to indicate interactivity.

### Lists Within Cards

- Use **dividers** (`hairlineWidth` border) between list items, not full-width — inset from the left to align with text.
- **Disclosure indicators** (chevron-right) on rows that navigate to detail screens.
- **Tappable rows** must have the full row as the touch target, not just the text.

---

## 6) Forms & Input UX

**Rules:**

- **One input per row** on mobile. Never place two text fields side-by-side (unlike web).
- **Labels above inputs**, not inside (placeholder-as-label is an anti-pattern — labels disappear on focus).
- **Inline validation** — show error text directly below the field, colored with `theme.error`.
- **Keyboard type** must match input: `numeric` for amounts, `email-address` for email, `phone-pad` for phone.
- **Auto-focus first field** on form screens.
- **"Done" / "Next" toolbar** on keyboard for field-to-field navigation.
- **Group related fields** in `SectionCard` containers with a descriptive title.
- **Long forms** should be broken into wizard steps (already implemented for onboarding).

---

## 7) Loading & Empty States

### Loading

| Context | Pattern |
|---------|---------|
| Full page load | Centered `ActivityIndicator` on `background` |
| Inline / card refresh | Small spinner inside the card or replacing content |
| Button action | Spinner replaces button label (keep button width stable) |
| Pull to refresh | Native refresh control on ScrollView |

### Empty States

- **Always show an empty state** — never a blank screen.
- Include: illustration/icon + descriptive text + primary CTA.
- Example: "No active loans" + "Apply for your first loan" button.
- Use `textSecondary` for the description, `primary` for the CTA.

### Error States

- **Inline errors** (form validation): red text below field.
- **API errors**: Toast notification via alert or inline error card.
- **Full page errors**: Error illustration + "Try Again" button.
- **Network errors**: Banner at top or full-page retry state.

---

## 8) Status Indicators & Badges

Use semantic colors consistently for loan/application status:

| Status | Color Token | Visual |
|--------|------------|--------|
| Approved / Active / Verified | `success` | Green dot or badge |
| Pending / Under Review | `warning` | Amber dot or badge |
| Rejected / Failed / Overdue | `error` | Red dot or badge |
| Draft / Inactive | `textSecondary` | Gray text |
| Informational | `info` | Blue badge |

**Rules:**

- **Status badges** should be small (12–14px, `small` variant), with 10% opacity background + solid text (e.g. `{ backgroundColor: success + '/10', color: success }`).
- **Do not rely on color alone.** Always include a text label alongside the color indicator (accessibility).

---

## 9) Gestures & Animations

### Recommended Gestures

| Gesture | Use Case | Notes |
|---------|----------|-------|
| Swipe back | Navigate back (iOS native) | Handled by React Navigation / Expo Router |
| Pull to refresh | Reload data on list screens | Standard `RefreshControl` |
| Swipe on list item | Quick actions (archive, delete) | Use sparingly, with undo option |
| Scroll | Content navigation | Default |

### Animation Guidelines

- **Use `react-native-reanimated`** for all animations (already set up).
- **Duration:** 200–300ms for micro-interactions, 300–500ms for transitions.
- **Easing:** Use `Extrapolation.CLAMP` for scroll-driven animations (already correct in `PageScreen`).
- **Avoid jarring animations.** Prefer subtle opacity fades and position slides.
- **Respect `prefers-reduced-motion`.** Provide a way to disable non-essential animations.

---

## 10) Accessibility (a11y)

**Rules:**

- **`accessibilityRole`** on all interactive elements (`"button"`, `"link"`, `"header"`).
- **`accessibilityLabel`** on icon-only buttons (e.g. back button — already implemented: `"Go back"`).
- **`accessibilityState`** for toggleable elements (e.g. collapsible cards — already implemented: `{ expanded }`).
- **Color contrast:** Ensure 4.5:1 ratio for normal text, 3:1 for large text (18px+). Current palette meets this.
- **Font scaling:** Support Dynamic Type (iOS) / font scale (Android). Avoid fixed pixel heights on text containers.
- **Touch targets:** 44x44pt minimum (see Section 4).

---

## 11) Platform-Specific Polish

### iOS

| Feature | Implementation |
|---------|---------------|
| Large title animation | `PageScreen` with `collapseTitleOnScroll` |
| Tab bar blur | `blurEffect: 'systemMaterialDark'` on `NativeTabs` |
| Back gesture | Native swipe-back via React Navigation |
| Back button style | SF Symbol `chevron.backward` (icon only; older iOS: `chevron.left`) |
| Safe areas | `SafeAreaView` edges on header and tab bar |
| Haptic feedback | Consider adding for destructive actions and confirmations |
| Status bar | Match to `background` color for seamless header |

### Android

| Feature | Implementation |
|---------|---------------|
| Tab bar indicator | `indicatorColor` on active tab |
| Back button style | Arrow-back icon (no text) |
| Material ripple | Consider `android_ripple` on Pressable for Material feel |
| Navigation bar | Match system nav bar color to `background` |
| Edge-to-edge | Ensure content respects system bars via safe area insets |

---

## 12) Anti-Patterns to Avoid

| Don't | Do Instead |
|-------|------------|
| Hamburger menu as primary nav | Bottom tab bar |
| Floating action button (FAB) for primary nav | Tab bar + contextual buttons |
| Modal for simple navigation | Push onto stack |
| Full-screen modals for forms | Push screen with back button |
| Custom back button behavior | Use native back (swipe on iOS, system back on Android) |
| Hiding the tab bar on primary screens | Tab bar always visible on tab-level screens |
| Icon-only tabs without labels | Always include text labels |
| More than 5 bottom tabs | Consolidate or use "More" pattern |
| Nested scroll views | Flatten layout or use `SectionList` |
| Alert dialogs for non-critical info | Inline messages or toasts |
| Auto-dismissing toasts for errors | Persistent error states user must dismiss |
| Pull-to-refresh on non-list screens | Only on scrollable data lists |
| Edit/Save/Cancel buttons in the header | Inline card actions or sticky bottom bar (`stickyFooter`) |
| Destructive actions (Sign out) in the header | Full-width button at the bottom of page content |
| Explicit Cancel button on edit screens | Back button = cancel (standard iOS pattern) |
| Multiple competing buttons in the header | On root screens: max 1 action + profile switcher |

---

## 13) Screen Layout Anatomy

### Root tab screen (`showBackButton: false`)

```
┌──────────────────────────────────┐
│  SafeArea (top)                  │
├──────────────────────────────────┤
│  Large title          [Avatar]   │  ← Profile switcher when enabled
│  Subtitle                        │  ← Fades on scroll
├──────────────────────────────────┤
│                                  │
│  ScrollView content              │
│  ┌────────────────────────────┐  │
│  │  SectionCard               │  │
│  │  ┌──────────────────────┐  │  │
│  │  │ Title        [Action]│  │  │
│  │  │ Description          │  │  │
│  │  ├──────────────────────┤  │  │
│  │  │ Content              │  │  │
│  │  │                      │  │  │
│  │  │ [Edit row →]         │  │  ← Inline contextual action
│  │  └──────────────────────┘  │  │
│  └────────────────────────────┘  │
│                                  │
│  ┌────────────────────────────┐  │
│  │  SectionCard               │  │
│  │  ...                       │  │
│  └────────────────────────────┘  │
│                                  │
│  [  Destructive / sign out  ]    │  ← Bottom of content for destructive actions
│                                  │
│  (bottom padding)                │
├──────────────────────────────────┤
│  Tab Bar                         │  ← Fixed at bottom (tab screens only)
└──────────────────────────────────┘
```

### Stack screen (`showBackButton: true`, no profile switcher)

```
┌──────────────────────────────────┐
│  SafeArea (top)                  │
├──────────────────────────────────┤
│ [←]         Title     [actions?] │  ← Title centered; optional `headerActions` right
├──────────────────────────────────┤
│  ScrollView …                    │
└──────────────────────────────────┘
```

### Form / Edit Screen Layout (with `stickyFooter`)

```
┌──────────────────────────────────┐
│  SafeArea (top)                  │
├──────────────────────────────────┤
│ [←]       Centered title  [ · ] │  ← Back = cancel; title one line, centered
├──────────────────────────────────┤
│                                  │
│  ScrollView content              │
│  ┌────────────────────────────┐  │
│  │  Form fields               │  │
│  │  ...                       │  │
│  └────────────────────────────┘  │
│                                  │
├──────────────────────────────────┤
│  [ Save changes ]               │  ← stickyFooter (fixed above safe area)
│  SafeArea (bottom)               │
└──────────────────────────────────┘
```

### Content Width

- **Max width: 800px** (`MaxContentWidth`), centered. This ensures readability on tablets and web.
- **Horizontal padding: 24px** (`Spacing.four`) on both sides.
- **Bottom padding** accounts for tab bar inset (iOS: 50, Android: 80) + safe area.

---

## 14) Modal & Sheet Guidelines

For future implementation:

| Type | When to Use | Presentation |
|------|-------------|-------------|
| **Bottom sheet** | Quick selections, confirmations, filters | Half-screen with drag handle |
| **Full-screen modal** | Complex multi-step flows (e.g. document upload) | With close (X) button top-right |
| **Alert dialog** | Destructive confirmations, critical errors | Native `Alert.alert()` |
| **Toast** | Success confirmations, non-critical info | Auto-dismiss after 3–4 seconds |

**Rules:**

- **Bottom sheets** are preferred over modals on mobile — they feel more natural and are dismissable by swipe.
- **Close button (X)** on modals goes in the **top-right** (iOS) or **top-left** (Android).
- **Modals should not navigate to other modals.** If a flow requires multiple steps, use a stack within the modal or a dedicated flow screen.

---

## 15) Onboarding & First-Run

**Rules:**

- **Progressive disclosure.** Don't ask for everything upfront — gather information as needed.
- **Wizard pattern** for multi-step onboarding (already implemented).
- **Skip/dismiss** should be available but not prominent.
- **Progress indicator** (step dots or fraction like "Step 2 of 4") during wizards.
- **Welcome back** — returning users should skip onboarding entirely (already handled via `BorrowerProfileGate`).

---

## Summary Checklist

When building new screens, verify:

- [ ] Uses `PageScreen` wrapper with appropriate props
- [ ] Title is descriptive (1–3 words)
- [ ] Back button shown on non-tab screens (`showBackButton`)
- [ ] **Root screens:** `showBorrowerContextHeader` only when the profile switcher should appear (tab roots)
- [ ] **Stack screens:** never pass `showBorrowerContextHeader`; compact bar has centered title + back on one row
- [ ] Header is minimal: 0–1 lightweight actions; profile switcher only on root screens
- [ ] Edit/Save actions are inline in cards or in `stickyFooter`, NOT in the header
- [ ] Destructive actions (sign out, delete) at the bottom of page content, never in header
- [ ] Form screens use `stickyFooter` for the primary Save/Submit button
- [ ] Contextual edit buttons use the inline row pattern (icon + label + chevron)
- [ ] Cards use `SectionCard` with consistent spacing
- [ ] Status indicators use semantic color tokens
- [ ] Loading state shown during data fetch
- [ ] Empty state with helpful CTA
- [ ] Touch targets ≥44pt
- [ ] `accessibilityRole` and `accessibilityLabel` on interactive elements
- [ ] Colors from `useTheme()`, never hardcoded
