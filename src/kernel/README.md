# Kernel

Run `vp run dev` for the frontend and `vp run dev:kernel` in a separate terminal
for the kernel. Restart `vp run dev:kernel` after changing Rust code.
Run `vp run test` for frontend tests and both debug and release kernel tests.
Run `vp run build` to produce `target/release/cloudready` with the frontend embedded.

- `cargo run`: API only at `http://127.0.0.1:3000`; no frontend build or embedding.
- `cargo run --release`: type-checks and builds the frontend using Vite+, embeds the resulting
  `target/userland-static-bundle/` files, and serves both the API and frontend.
  Run `vp install` before the first release build. Vite+ must be available locally
  in `node_modules/.bin` or on `PATH`.

The release executable is self-contained: deploying the frontend directory or Node.js
alongside it is unnecessary. Frontend source/configuration changes trigger a rebuild.

`/` serves `index.html`. Static files support GET and HEAD with content types;
unknown paths return 404 (there is no SPA routing fallback). `/api` and `/api/*`
remain reserved for the API. Development frontend serving is handled by `vp run dev`.

Embedding follows Cargo's release profile (including profiles inherited from it).
The test command includes embedded asset routing and runs once without watch mode.
Release tests build the frontend automatically. An empty frontend suite is allowed until
frontend tests are added; actual test failures still fail the command.
`vp test` remains the built-in frontend-only command.

Set `KERNEL_ADDR` to override the listening address, for example
`KERNEL_ADDR=127.0.0.1:3001 vp run dev:kernel`.
