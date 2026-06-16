# Handoff: Slice 2 — Photographer grid

## Where things stand
Slice 1 (Skeleton) and the frontend test harness are **complete, reviewed, and
merged to `main`**.

- `main` is at the merge commit for `slice-1-skeleton` (now deleted). Working tree clean.
- App launches, folder picker works, selection persists across relaunch, window drags
  — all manually verified.
- Frontend tests: Vitest + `@testing-library/svelte`. `npm test` is green (4 tests
  in `src/App.test.ts` covering App.svelte's loading → first-run → loaded branching).
  Setup details live in `IMPLEMENTATION.md` §Testing.
- Plan, IPC contract, slice definitions: `IMPLEMENTATION.md`. Domain language:
  `CONTEXT.md`. Decisions: `docs/adr/`. Known issues: `docs/ISSUES.md` (empty/open).

Two non-obvious gotchas already hit and recorded in agent memory (see `MEMORY.md`
index): plain Svelte SPA (not SvelteKit), and blocking Tauri commands must be `async`.

## Next build step: Slice 2 — Photographer grid
Defined in `IMPLEMENTATION.md` §Slices/2. Key points not to re-derive:
- New Rust command `list_photographers(root) -> Photographer[]` in a new `scan.rs`
  (register in `lib.rs`). Root's subdirs only; **skip dirs with zero images,
  counted recursively** (a photographer with images only inside Categories still counts).
- Cover = first image alphabetically, full-res for now (thumbnails are Slice 3).
- Frontend: `PhotographerGrid.svelte` + `list_photographers` wrapper in `ipc.ts`.
  `Photographer` type already declared in `src/lib/types.ts`.
- `scan.rs`'s folder-walking rules are pure-ish — the first real `cargo test`
  targets. Per the testing rule in `IMPLEMENTATION.md`: test that logic, not the
  command glue.
- **Done when:** grid shows one tile per non-empty photographer with a cover + name.

## How to run
- Dev: `npm run tauri dev` (needs Rust on PATH via `~/.cargo/env`; rustup already installed).
- Frontend: `npm test` (Vitest), `npm run check` (svelte-check), `npm run build` (vite).
- Rust only: `cd src-tauri && cargo check` / `cargo test`.
- GUI launch can't be driven headlessly here; the user tests interactively and reports back.

## Suggested skills
- **tdd** — drive the `scan.rs` `cargo test`s red-green-refactor.
- **run** / **verify** — launch the app and confirm Slice 2 behaviour (user clicks through).
- **code-review** — before merging Slice 2.

## Workflow note
Slice 1 was built on a `slice-N-*` branch, reviewed with `/code-review`, then merged
to `main` with `--no-ff` and the branch deleted. Follow the same pattern for Slice 2.
