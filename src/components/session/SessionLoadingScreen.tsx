import defaultWallpaper from "../../data/default-wallpaper.png";

/** Displays the session restoration state while the kernel checks the browser session cookie. */
export default function SessionLoadingScreen() {
  return (
    <main
      x-role="session loading screen"
      class="grid h-full w-full place-items-center bg-cover bg-center p-6 text-base"
      style={{ "background-image": `url(${defaultWallpaper})` }}
    >
      <section class="flex w-full max-w-xs flex-col items-center rounded-sm border border-white/30 bg-neutral-900/75 p-8 py-16 text-center text-neutral-100 shadow-xl backdrop-blur-sm">
        <span class="size-8 animate-spin rounded-full border-2 border-neutral-300/30 border-t-white" />
        <h1 class="mt-5 text-xl font-light">Loading...</h1>
      </section>
    </main>
  );
}
