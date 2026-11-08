import useWindowCloser from "../../components/window-manager/useWindowCloser";
import BrowserPanel from "./components/BrowserPanel";
import createNavigationController from "./navigation-controller";

/** Browses the local kernel filesystem and exposes common file actions. */
export default function FileManager() {
  const controller = createNavigationController();

  useWindowCloser(() => true);

  return (
    <section
      x-role="file manager"
      class="flex h-full min-h-0 flex-col overflow-hidden bg-white text-neutral-800"
    >
      <BrowserPanel controller={controller} />
    </section>
  );
}
