import Add16 from "@carbon/icons/es/add/16.js";
import ArrowDown16 from "@carbon/icons/es/arrow--down/16.js";
import ArrowUp16 from "@carbon/icons/es/arrow--up/16.js";
import Pause16 from "@carbon/icons/es/pause/16.js";
import Play16 from "@carbon/icons/es/play/16.js";
import SkipBack16 from "@carbon/icons/es/skip--back/16.js";
import SkipForward16 from "@carbon/icons/es/skip--forward/16.js";
import Stop16 from "@carbon/icons/es/stop/16.js";
import TrashCan16 from "@carbon/icons/es/trash-can/16.js";
import { Show } from "solid-js";
import AppFrame from "../../components/app-frame/AppFrame";
import Button from "../../components/button/Button";
import ListBox from "../../components/list-box/ListBox";
import CarbonIcon from "../../components/taskbar/CarbonIcon";
import TrackBar from "../../components/track-bar/TrackBar";

import type PlayerController from "./PlayerController";
import type { PlayerSnapshot, QueueItem } from "./PlayerController";

function formatTime(value: number, includeHours: boolean): string {
  const totalSeconds = Math.max(0, Math.floor(value));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const minutesAndSeconds = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  if (includeHours) return `${String(hours).padStart(2, "0")}:${minutesAndSeconds}`;
  return minutesAndSeconds;
}

/** State and actions consumed by the default player skin. */
export interface DefaultSkinProps {
  state: PlayerSnapshot;
  controller: PlayerController;
  pickerOpen: boolean;
  onAddFiles: () => void;
  attachVideo: (surface: HTMLDivElement) => void;
}

/** Displays the standard controls and video surface for a player. */
export default function DefaultSkin(props: DefaultSkinProps) {
  const queue = () => props.state.queue;
  const selected = () => props.state.selected;
  const currentIndex = () => props.state.currentIndex;
  const playing = () => props.state.playing;
  const volume = () => props.state.volume;
  const time = () => props.state.time;
  const duration = () => props.state.duration;
  const showHours = () => time() >= 3600 || duration() >= 3600;
  const current = () => {
    const index = currentIndex();
    if (index === null) return null;
    return queue()[index] ?? null;
  };

  const selectedIndex = () => queue().indexOf(selected() as QueueItem);

  const playTitle = () => {
    if (playing()) return "Pause";
    return "Play";
  };

  function itemLabel(item: QueueItem) {
    return item.media.name;
  }

  function handleMove(direction: -1 | 1) {
    props.controller.move(direction);
  }

  function handleRemove() {
    props.controller.removeSelected();
  }

  function handleStep(direction: -1 | 1) {
    props.controller.step(direction);
  }

  function handleTogglePlay() {
    if (playing()) props.controller.pause();
    else void props.controller.play();
  }

  function handleStop() {
    props.controller.stop();
  }

  function handleChangeVolume(value: number) {
    props.controller.setVolume(value);
  }

  function handleSeek(value: number) {
    props.controller.seek(value);
  }

  function handleSelect(item: QueueItem) {
    props.controller.select(item);
  }

  function handleActivate(item: QueueItem) {
    props.controller.activate(item);
  }

  return (
    <section x-role="media player" class="h-full min-h-0 bg-white text-neutral-800">
      <AppFrame>
        <AppFrame.Header>
          <section class="mr-2 flex flex-wrap items-center gap-1">
            <Button
              title={playTitle()}
              class=""
              onClick={handleTogglePlay}
              disabled={!current()}
              startIcon={
                <Show when={playing()} fallback={<CarbonIcon icon={Play16} />}>
                  <CarbonIcon icon={Pause16} />
                </Show>
              }
            />
            <Button
              title="Stop"
              class="@max-[400px]:hidden"
              onClick={handleStop}
              disabled={!current()}
              startIcon={<CarbonIcon icon={Stop16} />}
            />
            <Button
              title="Previous"
              class="@max-[360px]:hidden"
              onClick={handleStep.bind(null, -1)}
              startIcon={<CarbonIcon icon={SkipBack16} />}
              disabled={currentIndex() === null || currentIndex() === 0}
            />
            <Button
              title="Next"
              class="@max-[340px]:hidden"
              onClick={handleStep.bind(null, 1)}
              startIcon={<CarbonIcon icon={SkipForward16} />}
              disabled={currentIndex() === null || currentIndex() === queue().length - 1}
            />
            <div class="relative flex h-6 shrink grow basis-0 items-start gap-2">
              <TrackBar
                ariaLabel="Seek"
                title="Seek bar"
                range={{ min: 0, max: duration() }}
                step={0.1}
                value={time()}
                disabled={!duration()}
                onValueChange={handleSeek}
                class="w-full"
              />
              <span class="absolute right-0 -bottom-1 text-right">
                {formatTime(time(), showHours())} / {formatTime(duration(), showHours())}
              </span>
            </div>
            <div class="relative flex h-6 w-16 items-start gap-2">
              <TrackBar
                ariaLabel="Volume"
                title="Volume bar"
                range={{ min: 0, max: 1 }}
                step={0.01}
                value={volume()}
                onValueChange={handleChangeVolume}
                class="w-full"
              />
              <span class="absolute right-0 -bottom-1 text-right">
                {(volume() * 100).toFixed(0)}%
              </span>
            </div>
          </section>
        </AppFrame.Header>
        <AppFrame.Main>
          <div class="flex min-h-0 flex-1 flex-col gap-1 sm:flex-row">
            <div
              ref={props.attachVideo}
              class="flex min-h-0 flex-1 bg-black [&>video]:min-h-0 [&>video]:w-full [&>video]:flex-1 [&>video]:object-contain"
            />
          </div>
        </AppFrame.Main>
        <AppFrame.SecondarySidebarHeader class="flex items-center gap-1 p-2">
          <Button
            title="Add Files"
            class=""
            onClick={props.onAddFiles}
            disabled={props.pickerOpen}
            startIcon={<CarbonIcon icon={Add16} />}
          />
          <Button
            title="Remove selected"
            class=""
            onClick={handleRemove}
            disabled={!selected()}
            startIcon={<CarbonIcon icon={TrashCan16} />}
          />
          <Button
            title="Move up"
            class="ml-auto"
            onClick={handleMove.bind(null, -1)}
            disabled={selectedIndex() <= 0}
            startIcon={<CarbonIcon icon={ArrowUp16} />}
          />
          <Button
            title="Move down"
            class=""
            onClick={handleMove.bind(null, 1)}
            startIcon={<CarbonIcon icon={ArrowDown16} />}
            disabled={selectedIndex() < 0 || selectedIndex() >= queue().length - 1}
          />
        </AppFrame.SecondarySidebarHeader>
        <AppFrame.SecondarySidebar label="Queue" class="w-72">
          <div class="h-full w-full p-2">
            <ListBox
              class="h-full w-full"
              ariaLabel="Playback queue"
              items={queue()}
              selected={selected()}
              label={itemLabel}
              onSelect={handleSelect}
              onActivate={handleActivate}
            />
          </div>
        </AppFrame.SecondarySidebar>
      </AppFrame>
    </section>
  );
}
