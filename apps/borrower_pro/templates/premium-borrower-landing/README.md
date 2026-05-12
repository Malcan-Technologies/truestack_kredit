# Premium borrower landing (template)

This folder is **not wired into any Next.js app**. Copy files into a tenant app when you want the PinjoCap-style marketing landing (hero + stats bar + steps + products + why-us + calculator + FAQ + footer).

## Files

| File | Purpose |
|------|---------|
| `homepage-content.template.tsx` | Snapshot of `Pinjocep/app/homepage-content.tsx`. Rename to `homepage-content.tsx` in the tenant `app/` folder (or merge selectively). |

## After you copy `homepage-content.tsx`

1. **Legal constants** — Replace `@/app/components/legal/pinjocep-site` with your tenant module (e.g. `proficient-site.ts`, `demo-site.ts`).
2. **Footer legal copy** — Swap `pinjocep-borrower-footer-legal` imports for your tenant’s `legalLong` / `legalShort` (or `proficient-site-footer`).
3. **Optional `platformLinks`** — Pass `platformLinks` into `BorrowerProficientTruestackFooter` if your tenant uses custom links; otherwise omit for defaults.
4. **Hero image** — Add `public/landing/` under the tenant app and place your hero asset; update the `src` on the `<Image>` (Pinjocep uses `hero-kuala-lumpur-night5.png`).
5. **Fallback logo** — In `HomeBrandMark`, replace `/pinjocep-logo.png` with your default logo path when no tenant logo URL is returned.

## Optional: scam alert on `/` (Proficient Premium pattern)

In `app/page.tsx`, render `ScamAlertDialog` from `@borrower_pro/components/scam-alert-dialog` above your `<HomePageContent />`, passing `lenderName`, `officialWebsite`, and `kpktLicense` from your tenant legal module.
