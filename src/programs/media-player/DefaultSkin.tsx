import Add16 from "@carbon/icons/es/add/16.js";
import ArrowDown16 from "@carbon/icons/es/arrow--down/16.js";
import ArrowUp16 from "@carbon/icons/es/arrow--up/16.js";
import Pause16 from "@carbon/icons/es/pause/16.js";
import Play16 from "@carbon/icons/es/play/16.js";
import SkipBack16 from "@carbon/icons/es/skip--back/16.js";
import SkipForward16 from "@carbon/icons/es/skip--forward/16.js";
import Stop16 from "@carbon/icons/es/stop/16.js";
import VolumeMute16 from "@carbon/icons/es/volume--mute/16.js";
import VolumeUp16 from "@carbon/icons/es/volume--up/16.js";
import { Show } from "solid-js";
import Button from "../../components/button/Button";
import ListBox from "../../components/list-box/ListBox";
import CarbonIcon from "../../components/taskbar/CarbonIcon";

import type PlayerController from "./PlayerController";
import type { PlayerSnapshot, QueueItem } from "./PlayerController";

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
  const muted = () => props.state.muted;
  const volume = () => props.state.volume;
  const time = () => props.state.time;
  const duration = () => props.state.duration;
  const error = () => {
    if (props.state.error === "start") return "Playback could not start. Select Play to try again.";
    if (props.state.error === "playback")
      return "This file could not be played. Choose another file or try again.";
    return "";
  };
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
  const muteTitle = () => {
    if (muted()) return "Unmute";
    return "Mute";
  };
  function itemLabel(item: QueueItem) {
    return item.media.name;
  }
  function playSelected() {
    const item = selected();
    if (item) props.controller.activate(item);
  }
  function move(direction: -1 | 1) {
    props.controller.move(direction);
  }
  function step(direction: -1 | 1) {
    props.controller.step(direction);
  }
  function togglePlay() {
    if (playing()) props.controller.pause();
    else void props.controller.play();
  }
  function stop() {
    props.controller.stop();
  }
  function toggleMute() {
    props.controller.setMuted(!muted());
  }
  function changeVolume(event: Event) {
    props.controller.setVolume(Number((event.currentTarget as HTMLInputElement).value));
  }
  function seek(event: Event) {
    props.controller.seek(Number((event.currentTarget as HTMLInputElement).value));
  }
  function select(item: QueueItem) {
    props.controller.select(item);
  }
  function activate(item: QueueItem) {
    props.controller.activate(item);
  }
  return (
    <section
      x-role="media player"
      class="flex h-full min-h-0 flex-col gap-2 overflow-auto bg-white p-2 text-neutral-800"
    >
      <div class="flex min-h-0 flex-1 flex-col gap-2 sm:flex-row">
        <div class="flex min-h-36 min-w-0 flex-1 flex-col bg-neutral-900 text-white">
          <div
            ref={props.attachVideo}
            class="flex min-h-0 flex-1 [&>video]:min-h-0 [&>video]:w-full [&>video]:flex-1 [&>video]:object-contain"
          />
          <p class="truncate px-2 py-1">{current()?.media.name ?? "No media selected"}</p>
        </div>
        <div class="flex min-h-32 min-w-0 flex-1 flex-col gap-1">
          <div class="flex flex-wrap gap-1">
            <Button
              title="Add Files"
              class="w-7 px-0"
              onClick={props.onAddFiles}
              disabled={props.pickerOpen}
              startIcon={<CarbonIcon icon={Add16} />}
            />
            <Button
              title="Play selected"
              class="w-7 px-0"
              onClick={playSelected}
              disabled={!selected()}
              startIcon={<CarbonIcon icon={Play16} />}
            />
            <Button
              title="Move up"
              class="w-7 px-0"
              onClick={move.bind(null, -1)}
              disabled={selectedIndex() <= 0}
              startIcon={<CarbonIcon icon={ArrowUp16} />}
            />
            <Button
              title="Move down"
              class="w-7 px-0"
              onClick={move.bind(null, 1)}
              startIcon={<CarbonIcon icon={ArrowDown16} />}
              disabled={selectedIndex() < 0 || selectedIndex() >= queue().length - 1}
            />
          </div>
          <ListBox
            items={queue()}
            selected={selected()}
            current={current()}
            label={itemLabel}
            onSelect={select}
            onActivate={activate}
          />
        </div>
      </div>
      <Show when={error()}>
        <p role="alert" class="text-red-700">
          {error()}
        </p>
      </Show>
      <div class="flex items-center gap-2">
        <span>{Math.floor(time())}s</span>
        <input
          aria-label="Seek"
          type="range"
          min="0"
          max={duration()}
          step="0.1"
          value={time()}
          disabled={!duration()}
          onInput={seek}
          class="min-w-0 flex-1 outline-sky-300 focus:outline-2 focus:outline-offset-2"
        />
        <span>{Math.floor(duration())}s</span>
      </div>
      <div class="flex flex-wrap items-center gap-1">
        <Button
          title="Previous"
          class="w-7 px-0"
          onClick={step.bind(null, -1)}
          startIcon={<CarbonIcon icon={SkipBack16} />}
          disabled={currentIndex() === null || currentIndex() === 0}
        />
        <Button
          title={playTitle()}
          class="w-7 px-0"
          onClick={togglePlay}
          disabled={!current()}
          startIcon={
            <Show when={playing()} fallback={<CarbonIcon icon={Play16} />}>
              <CarbonIcon icon={Pause16} />
            </Show>
          }
        />
        <Button
          title="Stop"
          class="w-7 px-0"
          onClick={stop}
          disabled={!current()}
          startIcon={<CarbonIcon icon={Stop16} />}
        />
        <Button
          title="Next"
          class="w-7 px-0"
          onClick={step.bind(null, 1)}
          startIcon={<CarbonIcon icon={SkipForward16} />}
          disabled={currentIndex() === null || currentIndex() === queue().length - 1}
        />
        <Button
          title={muteTitle()}
          class="w-7 px-0"
          onClick={toggleMute}
          startIcon={
            <Show when={muted()} fallback={<CarbonIcon icon={VolumeUp16} />}>
              <CarbonIcon icon={VolumeMute16} />
            </Show>
          }
        />
        <label>
          Volume{" "}
          <input
            aria-label="Volume"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume()}
            onInput={changeVolume}
            class="w-24 outline-sky-300 focus:outline-2 focus:outline-offset-2"
          />
        </label>
      </div>
    </section>
  );
}
