# Kernel

Run `npm run dev` for the frontend and `npm run dev:kernel` in a separate terminal
for the kernel. Restart `npm run dev:kernel` after changing Rust code.
Run `npm run build` to type-check and bundle the frontend, then produce
`target/release/cloudready` with those assets embedded. Run `npm run test` for
frontend tests and both debug and release kernel tests.

- `cargo run`: API only at `http://127.0.0.1:3000`; no frontend build or embedding.
- `npm run build`: the supported release build. It produces
  `target/userland-static-bundle/`, then Cargo embeds the files in the release executable.
- `cargo build --release`: only embeds an existing frontend bundle. Use `npm run build`
  to create or refresh it.

The release executable is self-contained: deploying the frontend directory or Node.js
alongside it is unnecessary. Frontend source/configuration changes trigger a rebuild.

`/` serves `index.html`. Static files support GET and HEAD with content types;
unknown paths return 404 (there is no SPA routing fallback). `/api` and `/api/*`
remain reserved for the API. Development frontend serving is handled by `npm run dev`.

Embedding follows Cargo's release profile (including profiles inherited from it).
The test command builds the frontend before release tests so embedded-asset routing is covered.
An empty frontend suite is allowed until frontend tests are added; actual test failures still fail the command.
`npm run test:frontend` remains the built-in frontend-only command.

Set `KERNEL_ADDR` to override the listening address, for example
`KERNEL_ADDR=127.0.0.1:3001 npm run dev:kernel`.

To open the web OS in a native Chromium app window, pass the Chromium executable:
`cargo run -- --chromium="C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"`.
The kernel launches it with a fresh temporary profile, incognito mode, and Chromium's
`--app` window mode, so browser tabs, the address bar, and an existing Chrome profile
are not used. Debug builds target the Vite frontend at `http://localhost:5173`; release
builds target the kernel's embedded frontend.
