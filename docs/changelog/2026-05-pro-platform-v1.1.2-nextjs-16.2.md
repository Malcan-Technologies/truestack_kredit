# Changelog — pro-platform-v1.1.2 (Next.js 16.2)

## Summary

This release updates the Next.js web apps to a pinned **16.2.x** line, moves linting to the ESLint CLI flow required by Next 16, and standardizes AI/agent documentation across the monorepo and Next workspaces.

## Highlights

- **Next.js 16.2** — `apps/admin`, `apps/admin_pro`, and all `apps/borrower_pro/*` Next clients now target the 16.2 line.
- **ESLint 9 + `eslint-config-next`** — Next app linting now runs through the ESLint CLI with flat `eslint.config.mjs` files, replacing the removed `next lint` workflow.
- **Monorepo lint stability** — Root `eslint` dependencies and package-manager overrides keep the repo on one ESLint major that is compatible with `eslint-plugin-react` and the Next stack.
- **Agent documentation** — Root `AGENTS.md` points agents at `node_modules/next/dist/docs/`; per-app `AGENTS.md` files document how to regenerate local Next docs and reference workspace context.
- **Generated-doc hygiene** — `.gitignore` excludes `**/.next-docs/` and related generated Next documentation artifacts such as `next-env.d.ts`.

## Upgrade / Ops Notes

- After cloning or updating dependencies, run `npm install` at the monorepo root so `node_modules/next/dist/docs/` matches the installed Next version.
- If a Next app needs local agent docs refreshed, run this from that app directory:

```sh
npx @next/codemod@latest agents-md . --version <next-from-package.json> --output AGENTS.md
```

- CI and local checks should use the package scripts for `npm run lint` and `npm run build`.
- If lint is run with `--max-warnings 0`, resolve any newly surfaced ESLint warnings before promotion.

## Breaking Changes

- `next lint` is no longer available in Next 16. Use `eslint` through the workspace package scripts instead.
- Some ESLint/Next transitive dependencies may require **Node.js > 20.19**. Align local and CI Node versions with each package `engines` field if the toolchain is tightened.

## Compare

- Previous tag: `vX.Y.Z` or the last promoted `pro-platform-v*` tag.
- Current tag: `pro-platform-v1.1.2`
