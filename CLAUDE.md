# Paper Bag Configurator

Prototype of a 3D paper-bag configurator for a production company. Full requirements: `docs/SPEC.md`.

## Stack

Vite + React 19 + TypeScript, Three.js via React Three Fiber + drei, Zustand, react-i18next (PL + EN), Vitest + Testing Library, oxlint.

## Commands

- `npm run dev` — dev server
- `npm run typecheck` — `tsc -b`
- `npm test` — Vitest (single run)
- `npm run lint` — oxlint
- `npm run build` — production build

Before declaring work done: `npm run typecheck && npm test && npm run lint`.

## Layering (non-negotiable)

| Layer | Path | May import |
|---|---|---|
| Domain | `src/domain` | nothing app-specific; **no React, no three** |
| Pricing | `src/pricing` | domain |
| State | `src/state` | domain |
| UI | `src/ui` | domain, state, i18n |
| Renderer | `src/renderer` | domain types only (receives config as props) |

- The Zustand store holds the single source of truth (`BagConfiguration`). Three.js never owns config state.
- Ranges, option lists and business constants live in `src/domain/config/productCatalog.ts`, never in components.
- `Handle` is an independent entity; a bag has `handle: Handle | null`.
- Artwork placement goes through `ArtworkPlacement` (MVP: `FILL`) so a positioning module can be added later.

## Conventions

- Code, identifiers and comments in English. All user-facing text via `t()` with keys in both `src/i18n/locales/pl.json` and `en.json`.
- Units: millimetres in the domain; convert to scene units only inside `src/renderer`.
- Tests colocated as `*.test.ts(x)`.

## Agents (`.claude/agents/`)

- `principal-software-engineer` — lead: plans work, owns UI/integration, reviews architecture, delegates.
- `domain-architect` — domain model, catalog, validation, pricing contract.
- `3d-renderer` — procedural bag/handle geometry, textures, UV mapping, lighting, camera.
- `paper-bag-production-expert` — bag construction & manufacturing knowledge; owns `docs/PRODUCTION.md`.
- `qa-reviewer` — tests, acceptance-criteria verification, layering audits.
