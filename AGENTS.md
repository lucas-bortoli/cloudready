A self-contained, portable web application platform ("web OS").

## Commands

Use Vite+ scripts as the project entry points:

- `vp run dev`: start the frontend development server.
- `vp run dev:kernel`: start the Rust API server. Run alongside `vp run dev`, in a separate console.
- `vp run build`: type-check and bundle the frontend, then build the release executable
  with the assets embedded.
- `vp run test`: run frontend tests plus debug and release Rust tests.

Focused commands are available when needed:

- `vp run build:frontend`: type-check and build only the frontend bundle.
- `vp run test:frontend`: run only frontend tests.
- `vp run test:kernel`: run debug Rust tests.
- `vp run test:kernel:release`: rebuild the frontend bundle and run release Rust tests.

Cargo does not invoke Vite+ or Node.js. `cargo run` is API-only, and
`cargo build --release` requires an existing `target/userland-static-bundle/`.
Use `vp run build` for production builds.
