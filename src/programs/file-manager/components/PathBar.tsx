import CaretRight16 from "@carbon/icons/es/caret--right/16.js";
import VmdkDisk16 from "@carbon/icons/es/vmdk-disk/16.js";
import { createMemo, For } from "solid-js";
import CarbonIcon from "../../../components/taskbar/CarbonIcon";
import { cn } from "../../../lib/dom";

export interface PathBarProps {
  path: string;
  onPathSegmentClicked: (targetPath: string) => void;
  class?: string;
}

export default function PathBar(props: PathBarProps) {
  const segments = createMemo(() => props.path.split("/").filter((s) => s.length));

  const handleSegmentClick = (index: number) => {
    const targetPath = "/" + segments().slice(0, index).join("/");
    props.onPathSegmentClicked(targetPath);
  };

  return (
    <ol
      class={cn(
        "inline-flex shrink grow basis-0 items-center rounded-xs border border-neutral-400 bg-neutral-100",
        props.class,
      )}
    >
      <li
        class="inline-flex h-full cursor-pointer items-center bg-transparent px-2 py-1 transition-colors hover:bg-neutral-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 active:bg-neutral-300"
        tabIndex={0}
      >
        <CarbonIcon icon={VmdkDisk16} />
      </li>
      <For
        each={segments()}
        children={(segment, index) => (
          <>
            <CarbonIcon icon={CaretRight16} />
            <li
              class="inline-flex h-full cursor-pointer items-center bg-transparent px-2 py-1 transition-colors hover:bg-neutral-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 active:bg-neutral-300"
              tabIndex={0}
              onClick={handleSegmentClick.bind(null, index())}
            >
              {segment}
            </li>
          </>
        )}
      />
    </ol>
  );
}
