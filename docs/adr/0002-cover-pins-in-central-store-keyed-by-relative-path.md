# Cover-image pins live in a central store, keyed by relative path

A pinned Cover image is recorded in the central `tauri-plugin-store` JSON, keyed
by the photographer folder's path relative to the Photography Root — not in a
sidecar file inside the folder. This keeps the user's curated archive pristine
(no dotfiles scattered through a working photographer's directories), at the
known cost that **renaming or moving a photographer folder loses its pin**.

## Considered Options

- **Sidecar files** (e.g. a `.cover` dotfile in each photographer folder). Pins
  would survive renames and travel with the folder when shared/synced. Rejected
  for v1: it litters curated directories, and re-pinning after a rename is a
  one-click recovery, so the durability win doesn't justify the pollution.

## Consequences

- Renaming a photographer folder silently drops its pin; the Cover falls back to
  first-image-alphabetically until re-pinned. Acceptable because renames are rare.
- If folder portability/sync between machines becomes a real need, revisit — that
  is the scenario that would flip this decision toward sidecars.
