/** Displays the session restoration state while the kernel checks the browser session cookie. */
export default function SessionLoadingScreen() {
  return (
    <main
      x-role="session loading screen"
      class="relative flex h-full flex-col items-center justify-center bg-neutral-800 p-6 text-neutral-100"
    >
      <h1>Loading...</h1>
    </main>
  );
}
