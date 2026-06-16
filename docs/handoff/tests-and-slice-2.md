# Handoff: test harness decision, then Slice 2

## Where things stand
Slice 1 (Skeleton) is **complete and verified** by manual smoke test: app launches,
folder picker works, selection persists across relaunch, window drags.

- Branch: `slice-1-skeleton` (not yet merged to `main`). Working tree clean.
- Commits `fa58af3` → `712e3b6` cover the skeleton + three fixes. See `git log`.
- Plan, IPC contract, and slice definitions: `IMPLEMENTATION.md`.
- Domain language: `CONTEXT.md`. Decisions: `docs/adr/`. Known issues: `docs/ISSUES.md`
  (currently empty/open — the drag bug was fixed and moved to Resolved).

Two non-obvious gotchas already hit and recorded in agent memory (see `MEMORY.md`
index): plain Svelte SPA (not SvelteKit), and blocking Tauri commands must be `async`.

## Immediate open question (the live thread)
The user asked **"should there be tests for this slice?"** My recommendation, awaiting
their go-ahead:
- Skip Rust tests for `select_root`/`get_root` — thin glue over native dialog + store plugin.
- Stand up **Vitest** + one component test for `App.svelte`'s branching
  (loading → first-run `RootPicker` → loaded shell), mocking `src/lib/ipc.ts`.
- Defer real coverage to later slices that have pure logic worth testing.

If the user says yes: add Vitest + `@testing-library/svelte` + jsdom as devDeps, a
`test` script, and `src/App.test.ts` (or `.svelte.test.ts`). Verify `npm test` is green.

## Next build step: Slice 2 — Photographer grid
Defined in `IMPLEMENTATION.md` §Slices/2. Key points not to re-derive:
- New Rust command `list_photographers(root) -> Photographer[]` in a new `scan.rs`
  (register in `lib.rs`). Root's subdirs only; **skip dirs with zero images,
  counted recursively** (a photographer with images only inside Categories still counts).
- Cover = first image alphabetically, full-res for now (thumbnails are Slice 3).
- Frontend: `PhotographerGrid.svelte` + `list_photographers` wrapper in `ipc.ts`.
  `Photographer` type already declared in `src/lib/types.ts`.
- `scan.rs`'s folder-walking rules are pure-ish — good candidates for `cargo test`.

## How to run
- Dev: `npm run tauri dev` (needs Rust on PATH via `~/.cargo/env`; rustup already installed).
- Frontend only: `npm run check` (svelte-check), `npm run build` (vite).
- Rust only: `cd src-tauri && cargo check`.
- GUI launch can't be driven headlessly here; the user tests interactively and reports back.

## Suggested skills
- **tdd** — if writing the Vitest/cargo tests, drive them red-green-refactor.
- **run** / **verify** — to launch the app and confirm Slice 2 behaviour (user clicks through).
- **code-review** — before merging `slice-1-skeleton` or finishing Slice 2.
