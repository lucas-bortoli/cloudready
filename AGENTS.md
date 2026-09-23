A self-contained, portable web application platform ("web OS").

## Commands

Use npm scripts as the project entry points:

- `npm run dev`: start the frontend development server.
- `npm run dev:kernel`: start the Rust API server. Run alongside `npm run dev`, in a separate console.
- `npm run build`: type-check and bundle the frontend, then build the release executable
  with the assets embedded.
- `npm run test`: run frontend tests plus debug and release Rust tests.

Focused commands are available when needed:

- `npm run build:frontend`: type-check and build only the frontend bundle.
- `npm run test:frontend`: run only frontend tests.
- `npm run test:kernel`: run debug Rust tests.
- `npm run test:kernel:release`: rebuild the frontend bundle and run release Rust tests.

Cargo does not invoke Vite or Node.js. `cargo run` is API-only, and
`cargo build --release` requires an existing `target/userland-static-bundle/`.
Use `npm run build` for production builds.

## Verification

- Do not run TypeScript checks, frontend builds, or broad test suites after every small change.
  Run only the focused verification relevant to the change, or run broader checks when the user
  requests them or before a meaningful handoff.

## Frontend structure

- Use `kebab-case` directory names for feature areas, such as `components/window-manager/`.
- Put one exported component in each `PascalCase.tsx` file. Name components for one entity
  in singular form; use plural names only for collection renderers, such as `WindowsOutlet`.
- Keep types and helpers within a feature directory until another feature needs them. Promote
  only framework-independent, reusable utilities to `src/lib/`.
- Name context modules `FeatureContext.tsx`; export a matching `FeatureProvider` and
  `useFeature` hook.
- Co-locate component tests as `Component.test.tsx`.
- Prefer explicit relative imports over barrel files unless a feature develops a deliberate
  public API.

## Markup roles

- The `x-role` attribute is sacred: it defines stable semantic roles in the web OS markup.
  Preserve every existing `x-role` value verbatim. Never remove, rename, repurpose, or replace
  one without explicit user approval; add one to canonical structural elements when needed.

## Errors

- Public application and library APIs that can fail in a recoverable way must throw exported,
  named error classes rather than an unadorned `Error`.
- Define one error class for each meaningful, catchable failure condition and preserve runtime
  `instanceof` behavior.
- Document every public throwing API with `@throws {SpecificError}` entries.
- Format JSDoc as multiline blocks: use a summary line and put each `@throws` tag on its own line.
- Across HTTP boundaries, use stable machine-readable error codes and map them to the matching
  client-side error classes.
- Reserve generic errors for unrecoverable programmer bugs and internal assertions.
