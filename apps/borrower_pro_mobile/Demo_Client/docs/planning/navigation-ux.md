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
- **Card actions** sit at the **top-right** of the card header via the **`action`** prop:
  - **Outline / toolbar controls** — e.g. **Edit** on "My account", **Retry** on error cards (`PageHeaderToolbarButton`).
  - **Section status summaries** — e.g. **`InlineStatusRow`** / **`VerifiedStatusRow`** (`@/components/verified-status-row`) for Account security (email verified, passkeys registered, 2FA enabled) and Profile (KYC state, signing certificate **Active**). Same corner as edit buttons; body content stays description + CTAs only. See **§8** and **Brand §5** (`InlineStatusRow` tone → icon mapping).
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
| Pull to refresh | Native refresh control on ScrollView or `FlatList` (see §17 for paginated lists) |
| Load more (pagination) | Footer spinner on `FlatList` while the next page loads (§17) |

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

### Section headers vs. list/detail chips

- **Account / Profile section cards** (security, KYC, signing certificate): put the **primary state** in **`SectionCard` `action`** using **`InlineStatusRow`** or **`VerifiedStatusRow`** — **icon (18px) + `smallBold` label**, no pill background. This matches the signing-certificate **Active** treatment and keeps the header aligned with **Edit** / outline actions on other cards. Reference: `src/components/verified-status-row.tsx`, Brand **§5** (tone → icon table).
- **Loan/application list rows and detail hero rows** continue to use **`MetaBadge`** / **`StatusBadge`** / **`ChannelPill`** per Brand **§5** — those contexts are metadata strips or dense chips, not settings-style section headers.

**Rules:**

- **Pill-style status** (lists, timelines, repayment rows): small (12–14px, `small` variant), often with 10% opacity background + solid text (e.g. `{ backgroundColor: success + '/10', color: success }`) where `MetaBadge` / tonal pills apply.
- **Section-header status** (`InlineStatusRow`): no pill; semantic colour on **icon + label** only.
- **Do not rely on color alone.** Always include a text label alongside the colour indicator (accessibility).

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
│  │  │ Title    [Status/Edit]│  │  │  ← `SectionCard` `action`: InlineStatusRow or outline button
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
| **Toast** | Success confirmations, non-critical info, copy/save feedback | `toast(...)` from `@/lib/toast` — see §18 |

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

## 16) Notification inbox (stack screen)

The notification center is a **data list** opened from the **header bell** on root tab screens. It is **not** listed under Settings — duplicate entry points compete with the bell and clutter the settings hierarchy.

| Concern | Pattern |
|--------|---------|
| **Entry** | Bell only (`NotificationHeaderButton`). Do not add a second row in Settings for the same inbox. |
| **Reload** | **Pull-to-refresh** via `PageScreen`’s `refreshControl` prop (`RefreshControl`). Omit a separate **Refresh** button — it duplicates PTR and clutters the layout. |
| **Unread summary** | State the count in the **SectionCard `description`** (e.g. “3 unread notifications…” or “You’re all caught up…”), not as a third chip in a horizontal toolbar beside actions. |
| **Mark all read** | **Secondary** action: `SectionCard` **`action`** slot, `PageHeaderToolbarButton` with **`variant="outline"`**. Show only when `unreadCount > 0`; use **`loading` / `disabled`** while the mutation runs. This matches “section edit” placement (Section 3). |
| **Back fallback** | Use a sensible root when the stack has no history (e.g. `backFallbackHref="/"`), not Settings, since the user did not arrive via Settings. |
| **Initial load** | Omit `refreshControl` while the first fetch shows a skeleton (or gate PTR) so users do not trigger overlapping reloads during the initial request. |
| **Pagination** | **Infinite scroll**: `Animated.FlatList` via `PageScreen` **`scrollableOverride`**; first page on load; **pull-to-refresh** reloads page 1; **`onEndReached`** loads the next page. Footer **`ActivityIndicator`** while fetching more. Use a **ref guard** so `onEndReached` does not fire duplicate requests. See §17. |

**Header bell badge** (if implemented) stays on the bell control; the inbox screen reinforces count in the card description so the page does not duplicate a competing badge row.

---

## 17) Dynamic lists (default for API-backed feeds)

Any screen that loads **many rows from an API** (notifications, activity feeds, transaction history, long directories) should use this pattern unless there is a strong reason not to (e.g. a tiny fixed list).

| Topic | Convention |
|-------|--------------|
| **Scroll container** | **`PageScreen` + `scrollableOverride`** with Reanimated **`Animated.FlatList`** — **not** `ScrollView` wrapping a mapped list. Nesting a `FlatList` inside `PageScreen`’s default `ScrollView` breaks virtualization and scroll performance. |
| **Page size** | Match the API default (e.g. **20**) or a documented `pageSize`; keep it consistent per resource. |
| **Initial load** | Fetch **page 1**, show skeleton or spinner in **`ListHeaderComponent`** (or a dedicated placeholder) until the first response returns. |
| **Pull to refresh** | Reset to **page 1** and **replace** the list (same as first load). Reuse the same fetch helper as initial load. |
| **Load more** | **`onEndReached`** + **`onEndReachedThreshold`** (~**0.35**–**0.4**). Only fire when there are items, **`hasMore`** is true (from API `pagination`), and not already loading. |
| **Loading more** | **`ListFooterComponent`**: small centered **`ActivityIndicator`**. Optionally **`loadingMoreRef`** (or equivalent) to block overlapping append requests. |
| **Append** | **Concatenate** new rows; **dedupe by stable id** if the client can ever receive overlaps. Update local pagination state from **`response.pagination`**. |
| **Empty** | After the first successful fetch with zero rows, show an **empty state** in the header area (or list empty component), not an infinite spinner. |
| **Platform** | **`removeClippedSubviews`** on Android can help performance; test scroll position and headers. |

**Reference implementation:** `src/app/(app)/notifications.tsx`.

---

## 18) Toast notifications (`toast` API)

The mobile app provides a brand-aware toast system in `src/lib/toast` that mirrors the web app's [`sonner`](https://sonner.emilkowal.ski/) API. Use it for transient, non-blocking feedback — copy confirmations, save success, recoverable async errors, and small status hints.

### When to use

| Use a toast | Don't use a toast |
|-------------|--------------------|
| Confirm a tap-to-copy / tap-to-save / dismiss happened (`toast.success(...)`) | Critical errors that need a decision (use `Alert.alert`) |
| Recoverable async errors (`toast.error(...)`) | Inline form validation (use red text under the field, see §6) |
| Lightweight tips / status (`toast.info(...)`, `toast.warning(...)`) | Long-form content (use `SectionCard`) |
| Explain what just happened after a tap | Persistent state the user must continue to see (use a banner or empty state) |

### API

`toast` is a singleton — call it from anywhere (components, hooks, async callbacks, even outside React):

```tsx
import { toast } from '@/lib/toast';

toast('Email copied');
toast.success('Saved', { description: 'Profile updated.' });
toast.error('Network error', { duration: 6000 });
toast.info('Tip: tap the bell to see all notifications.');
toast.warning('Connection unstable');

const id = toast.success('Uploaded', { duration: 0 }); // sticky
toast.dismiss(id);   // dismiss one
toast.dismiss();     // dismiss all
```

`<ToastProvider />` mounts once near the root (already wired in `src/app/_layout.tsx`) and registers itself with the singleton — call sites do not need a hook or context.

### Behavior

| Behavior | Default |
|----------|---------|
| Position | Top, below the device safe area (mirrors sonner's web default) |
| Duration | 2400 ms; pass `duration: 0` to keep open until manually dismissed |
| Stack | Up to 3 visible at once; older toasts drop off |
| Dismiss | Tap to dismiss; auto-dismiss timer always set unless `duration: 0`; `toast.dismiss(id?)` dismisses programmatically |
| Animation | Gentle timed slide-in (~280 ms `easeOutCubic`) and fade-out (~220 ms) — no spring/bounce, per §9 (200–300 ms micro-interactions) |
| Width | Centered, capped at `MaxContentWidth` (800px) for tablets / web |
| Variants | `default`, `success`, `error`, `warning`, `info` — each ships a semantic icon and tinted background using the brand status colors |

### Visual

Toasts use the same surface as cards (`backgroundElement` + hairline border + 14px radius), with a small leading semantic icon for `success` / `error` / `info` / `warning` (no icon for `default`), the message in `smallBold`, and an optional `description` line in `small` `textSecondary`. An optional `action` button (e.g. "Undo") sits on the trailing edge.

### Rules

- **Keep messages short.** Title 1 line, optional `description` 1–2 lines.
- **Always pair a toast with the action that triggered it.** A copy-to-clipboard tap should toast `"<Field> copied"` with the copied value as the description. A failed save should toast `"Couldn't save"` with an error tone.
- **Never use a toast for a destructive confirmation.** Destructive actions still go through `Alert.alert` with explicit Cancel / Confirm buttons — toasts are dismissible and easy to miss.
- **Never toast on every render.** Toast on user-initiated actions or one-shot side effects, not as a substitute for inline UI state.
- **Never toast unrecoverable errors silently.** If the user can't proceed without acting, render an inline error state instead.
- **Use the right tone:** `success` for confirmations, `error` for failures the user should know about, `warning` for risky states (low connectivity, stale data), `info` for tips, `default` for neutral confirmations like "Copied".
- **Don't stack-spam.** If the same action can fire repeatedly (e.g. tap-to-copy), reuse a stable `id` so the latest call replaces the previous toast instead of stacking.

### Reference implementation

- Tap-to-copy contact rows: `src/components/help-contact-card.tsx` — copies email/phone via `expo-clipboard` and confirms with `toast.success(\`${label} copied\`, { description: value })`.

---

## 19) Horizontal carousels (KPI / metric strips)

When a card needs to show **3+ small, equally-weighted summary tiles** (KPIs, repayment metrics, quick stats), prefer a **horizontal snap carousel** over a 2x2 grid. The carousel:

- preserves vertical real estate (one row instead of two)
- communicates "there is more to see" via a peek of the next card
- pages cleanly with snap behaviour and pagination dots

Use the shared component `HorizontalSnapCarousel` in `src/components/horizontal-snap-carousel.tsx`. Do **not** re-implement scroll math, snap intervals, or pagination dots — extend the shared component instead so all carousels stay visually consistent.

### When to use vs. when to skip

| Use a carousel | Skip the carousel |
|----------------|-------------------|
| 3+ tiles of comparable importance (KPIs, metric chips) | 1–2 tiles → place inline, no scroll affordance needed |
| Tiles need to stay readable on small screens (≥160pt wide) | Tiles are tiny pills (badges, status chips) → use a wrap-flex grid |
| Tiles are independent — order is browseable, not ranked | Order is significant and the user must compare them at once → use a fixed grid |
| The strip would otherwise force two stacked rows on narrow phones | The strip is part of a form / requires simultaneous interaction (tap multiple tiles together) |

### API & sizing

```tsx
import {
  HorizontalSnapCarousel,
  useSnapCarouselCardWidth,
} from '@/components/horizontal-snap-carousel';

// Default: one card fills the screen with a peek of the next.
<HorizontalSnapCarousel initialIndex={1}>
  <KpiCard ... />
  <KpiCard ... />
  <KpiCard ... />
</HorizontalSnapCarousel>

// Multiple cards visible (e.g. small metric chips inside a SectionCard):
const { width } = useWindowDimensions();
const chipWidth = Math.max(132, Math.floor((width - 80) / 2));

<HorizontalSnapCarousel
  pagePadding={Spacing.three}      // matches the wrapping container's inner padding
  gap={Spacing.two}
  cardWidth={chipWidth}>            // explicit width when 2+ visible at a time
  <MetricChip ... />
  ...
</HorizontalSnapCarousel>
```

| Prop | Default | Notes |
|------|---------|-------|
| `cardWidth` | auto: `windowWidth - pagePadding*2 - peek` | Pass an explicit width when you want **multiple cards visible** at once. |
| `gap` | `Spacing.three` (16) | Gap between cards. Use `Spacing.two` for denser strips. |
| `pagePadding` | `Spacing.four` (24) | Horizontal padding of the **wrapping container** (page or `SectionCard`). The carousel applies a matching negative margin so cards bleed to the edges. |
| `peek` | `36` | Only used when `cardWidth` is auto-computed; how much of the next card peeks. |
| `minCardWidth` | `180` | Floor for the auto-computed width on very narrow screens. |
| `initialIndex` | `0` | Card to land on first (e.g. the most relevant KPI). |
| `showDots` | `true` | Pagination dots below the strip. Keep enabled unless the surrounding context already communicates pagination. |

### Rules

- **Always bleed to the edges.** Pass the wrapping container's horizontal padding via `pagePadding` so cards align with the edge of the screen / section card and the user feels they can keep scrolling.
- **Always show pagination dots** for 2+ cards (the default). They double as a visible affordance that the strip is scrollable, even when the peek is subtle.
- **Pick a sensible `initialIndex`.** Land on the most relevant card first (e.g. `Outstanding` rather than the first one alphabetically).
- **Enforce a minimum readable width.** ~140pt for compact metric chips, ~180pt for full KPI cards. Smaller than that and tiles become illegible.
- **One snap carousel per logical strip.** Don't nest carousels or place two side-by-side — that contradicts the "one direction of motion at a time" mobile heuristic.
- **Don't put primary CTAs inside carousel cards.** Tiles are summaries; primary actions belong in the `stickyFooter` or inline rows (§3).
- **Don't replace structured lists with carousels.** A list of repayments, transactions, or notifications is a vertical list — the carousel pattern is for **summary tiles**, not feed items.

### Reference implementations

- Dashboard KPI strip — Active Loans / Outstanding / Next Payment / Before Payout: `src/app/(app)/(tabs)/index.tsx` (`HorizontalSnapCarousel` with the default 1-card-per-screen layout).
- Loan detail "Repayment progress" metric chips — Paid / Overdue / Late fees / On-time: `src/app/(app)/loans/[loanId]/index.tsx` (`HorizontalSnapCarousel` with explicit `cardWidth` so ~2 chips show at once).

---

## 20) Channel pill (Online / Physical)

Loans and applications can originate from two channels: a self-serve **Online** flow or an in-branch **Physical** flow. The borrower needs to recognise that distinction at a glance — both because the surfacing differs (e.g. PHYSICAL drafts are read-only on mobile) and because it sets expectations for who owns the next step.

Use the shared component `ChannelPill` in `src/components/channel-pill.tsx` everywhere a channel needs to be communicated. Do **not** invent new icon pairs.

### Iconography & label (locked)

| Channel | Icon (`MaterialIcons`) | Label |
|---|---|---|
| `ONLINE`   | `computer`  | Online   |
| `PHYSICAL` | `apartment` | Physical |

These were standardised after the loans tab, loans detail, and applications detail each shipped with **different** icon pairs (`apartment`/`computer`, `storefront`/`language`, `store`/`wifi`) — confusing for borrowers who cross those screens. Treat the pair as part of the brand vocabulary.

### Sizes

- `size="default"` (rounded 999, 14pt icon) — **detail-screen header badges** alongside the `StatusBadge`.
- `size="compact"` (rounded 8, 12pt icon, 11pt label) — **list rows / dense card headers** (e.g. `(tabs)/loans.tsx` cards).

### Placement

- **Lists:** in the top-right of each row's header (paired with the status pill on the left).
- **Detail screens:** inside the `headerBadges` row directly under the hero amount.

### Colors

`Online` uses the theme's `info` accent (light tint + matching foreground). `Physical` uses a neutral `text` + `backgroundSelected` to read as "happens off-screen". Don't override.

### Reference implementations

- Loans tab cards: `src/app/(app)/(tabs)/loans.tsx`
- Loan detail header: `src/app/(app)/loans/[loanId]/index.tsx` (`LoanHeader`)
- Application detail header: `src/app/(app)/applications/[id].tsx`

---

## 21) Detail-screen anatomy & cross-linking

**Loan** and **application** detail screens share one anatomy so the borrower learns it once. Future entity-detail screens (e.g. transaction detail) MUST follow this template.

### Anatomy (top → bottom)

1. **Header block** (`headerWrap`):
   - `subtitle` hero — usually the headline amount (`formatRm(...)`).
   - One-line context — `borrower · product` (or equivalent).
   - **Badges row** (`headerBadges`) — `StatusBadge` first, then `ChannelPill`, then small attribute chips (e.g. schedule type).
   - **Cross-link row** (optional, see below) — minimal one-line link to the related entity.
2. **Primary section card** — the most actionable summary (loan: schedule + repayment progress; application: loan summary).
3. **Borrower** card.
4. **Product / details** card (collapsed by default if not actionable).
5. Domain-specific cards (Documents, Pending offer, …).
6. **`ActivityTimelineCard`** — collapsed by default (§22).
7. Sticky / inline CTA (`Continue`, `Make payment`, …).

### Cross-link between application ↔ loan

When an application has been approved and a loan record exists, **always** surface a minimal navigation affordance — and vice versa. This mirrors the web borrower portal's "View loan" / "View application" buttons but is condensed to a single row to fit mobile.

```tsx
{linkedLoanId ? (
  <Pressable
    accessibilityRole="link"
    accessibilityLabel="View linked loan"
    onPress={() => router.push(`/loans/${linkedLoanId}` as Href)}
    style={styles.crossLink}>
    <ThemedText type="small" themeColor="textSecondary">
      Loan created
    </ThemedText>
    <View style={styles.crossLinkAction}>
      <ThemedText type="linkPrimary">View loan</ThemedText>
      <MaterialIcons name="arrow-forward" size={13} color={theme.primary} />
    </View>
  </Pressable>
) : null}
```

Rules:

- Place the cross-link **inside the header block**, immediately under the badges row. Never in a button stack — the relationship is informational, not a primary CTA.
- Left side: a quiet contextual label (`Loan created`, `From application`).
- Right side: `linkPrimary` text + `arrow-forward` (13pt). No filled button.
- Only render when the linked entity actually exists (`loan?.id` / `app?.loan?.id`). Don't show a disabled state.
- Use `accessibilityRole="link"` + a descriptive `accessibilityLabel`.
- Routes: applications live at `/applications/[id]`, loans at `/loans/[loanId]`. Keep these stable across screens — list rows, header links, and tab pushes all use the same plural prefix.

### Reference implementations

- `src/app/(app)/applications/[id].tsx` — `Loan created → View loan`.
- `src/app/(app)/loans/[loanId]/index.tsx` — `From application → View` (in `LoanHeader`).

---

## 22) Activity timeline (`ActivityTimelineCard`)

Detail screens that surface audit history (applications, loans, payments…) MUST use the shared `ActivityTimelineCard` in `src/components/activity-timeline.tsx`. It renders a **dot-and-line** timeline inside a collapsible `SectionCard`, with each row showing:

- Headline label (e.g. "Application submitted").
- Actor + relative time (`by You · 5 min ago`).
- Optional inset detail block (status diff, uploaded filename, counter-offer terms…).
- Absolute date footer.

### Why dot-line over icon-circle

We tried both. The icon-circle variant (32pt round badge per row) made the timeline visually compete with the surrounding `SectionCard`s and felt heavier than the events warranted (audit history is supplemental, not the primary content). The thin vertical guide line + small dot keeps the rhythm scannable and lets the section sit quietly at the bottom of the screen.

### API

```ts
interface ActivityTimelineEvent {
  id: string;
  label: string;        // "Application submitted"
  timestamp: string;    // ISO
  actor?: string | null;
  detail?: ReactNode;   // pre-rendered inset (status diff, etc.)
}
```

Domain → timeline conversion lives in `src/lib/{domain}/timeline.ts` (e.g. `applicationTimelineLabel`, `borrowerTimelineActionInfo`). Screens map raw audit events to `ActivityTimelineEvent` and pass them to `ActivityTimelineCard`. The card is dumb about domain shapes.

### Rules

- **Always collapsed by default.** Audit history is supplemental.
- **Don't put primary actions in timeline rows.** Detail blocks are read-only.
- **Use the shared converter helpers** (`borrowerTimelineActionInfo` / `applicationTimelineLabel`) — never inline action-label maps in screens.
- **Pagination is the timeline's job.** Pass `hasMore` + `loadingMore` + `onLoadMore` and the card renders the "Load more" pressable.

### Reference implementations

- Loan detail: `src/app/(app)/loans/[loanId]/index.tsx` (`loanEventToTimelineEvent`).
- Application detail: `src/app/(app)/applications/[id].tsx` (`applicationEventToTimelineEvent`).

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
- [ ] Status indicators use semantic color tokens; **Account / Profile section headers** use **`InlineStatusRow`** in **`SectionCard` `action`** (not pills) where applicable (§8, Brand §5)
- [ ] Loading state shown during data fetch
- [ ] Empty state with helpful CTA
- [ ] Touch targets ≥44pt
- [ ] `accessibilityRole` and `accessibilityLabel` on interactive elements
- [ ] Colors from `useTheme()`, never hardcoded
- [ ] **Notification inbox:** bell-only entry (no duplicate Settings row); PTR for reload; unread copy in `SectionCard` description; “Mark all read” as outline card action when applicable (`src/app/(app)/notifications.tsx`)
- [ ] **Dynamic / long lists:** `PageScreen` `scrollableOverride` + `Animated.FlatList`; paginated fetch; PTR = page 1; `onEndReached` = next page; footer loading indicator (§17)
- [ ] **Toasts:** non-blocking confirmations and recoverable errors use `toast(...)` from `@/lib/toast` (not `Alert.alert`); short copy; correct semantic variant; never used for destructive confirmations (§18)
- [ ] **KPI / metric strips (3+ tiles):** use `HorizontalSnapCarousel` from `@/components/horizontal-snap-carousel` with bleed-to-edge `pagePadding`, an explicit `cardWidth` for multi-visible strips, and pagination dots — no bespoke ScrollView pagers (§19)
- [ ] **Channel pill (Online / Physical):** use `ChannelPill` from `@/components/channel-pill` (locked icons `computer`/`apartment`); never re-implement; `compact` size in lists, default size in detail-screen badges row (§20)
- [ ] **Detail screens** follow the shared anatomy (hero amount → context line → badges row → optional cross-link → primary card → borrower → details → domain cards → activity → CTA) (§21)
- [ ] **Cross-link between application ↔ loan** rendered as a quiet header row (`label + linkPrimary + arrow-forward`), not a button stack — only when the linked entity exists (§21)
- [ ] **Activity timeline** uses shared `ActivityTimelineCard` (dot-and-line) with domain → `ActivityTimelineEvent` converter helpers; collapsed by default; pagination passed via `hasMore` / `onLoadMore` (§22)
