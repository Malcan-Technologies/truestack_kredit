<!-- BEGIN:nextjs-agent-rules -->

# Next.js: ALWAYS read docs before coding

Before any Next.js work, find and read the relevant doc in `node_modules/next/dist/docs/` at the **monorepo root** after `npm install`. Your training data is outdated — the docs are the source of truth.

<!-- END:nextjs-agent-rules -->

## truestack-kredit (monorepo)

- **Repo-wide docs:** `truestack_kredit/node_modules/next/dist/docs/` (matches the hoisted `next` version from the root install).
- **Per-app agent index + `.next-docs/`** (gitignored, regenerate locally) exist under:
  - `apps/admin`
  - `apps/admin_pro`
  - `apps/borrower_pro/Demo_Client`
  - `apps/borrower_pro/Proficient_Premium`
  - `apps/borrower_pro/Pinjocep`
- When editing one of those apps, open **that app’s** `AGENTS.md` and resolve paths under that app’s `./.next-docs/` once the codemod has been run there, or use the repo-wide `node_modules/next/dist/docs/` path above.
- **After upgrading `next`** in an app, re-run the codemod **from that app’s directory** (non-interactive):

  ```bash
  cd apps/admin   # or admin_pro, borrower_pro/..., etc.
  npx @next/codemod@latest agents-md . --version <next-version-from-package.json> --output AGENTS.md
  ```

  Example when `next` is `16.2.4`: `--version 16.2.4`.

- **Not covered** by these Next.js agent files unless you add them: `apps/backend`, `apps/backend_pro`, `apps/signing-gateway`, `apps/borrower_pro_mobile`, `packages/*`, etc.
