# AGENTS.md

## Structure

- `packages/player` is the core player package. other monorepo packagers in `packages/` are addons.
- player and addons are framework-agnostic. Framework dependent demo app lives under `apps/`.
- common or foundational features of player are implemented as components, under `src/components`.
- distinguishing features are implemented as addon, under `packages/`.
- player has no knowlege of name and content of addons.
- player doens't implement addon system, it only exposes extension points.
- components and addons share same extension points.
- refactor extension points from time to time as needed and update in `README.md`.
- run test after change in extension points or other major refactoring.
- use Vite for build pipeline.
- hot-module-reload for all source code and resources, including assembly scripts.

## Coding convention

- split major css and html fragments into separate files, don't mix in typescript.
- split classes and files when they started to draft away from single-responsibility principle.
