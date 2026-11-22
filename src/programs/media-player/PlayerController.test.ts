import { expect, it, vi } from "vitest";
import PlayerController, { type PlaybackAdapter, type PlaybackEvent } from "./PlayerController";

it("preserves playback identity across reordering and ignores retired sessions", () => {
  const sessions: Array<(event: PlaybackEvent) => void> = [];
  const adapter: PlaybackAdapter = {
    open: vi.fn((_url, notify) => sessions.push(notify)),
    play: vi.fn(async () => {}),
    pause: vi.fn(),
    seek: vi.fn(),
    setVolume: vi.fn(),
    clear: vi.fn(),
    dispose: vi.fn(),
  };
  const player = new PlayerController(adapter);
  player.add([
    { name: "one", url: "/one" },
    { name: "two", url: "/two" },
  ]);
  const [first, second] = player.getSnapshot().queue;
  player.select(second);
  player.move(-1);
  expect(player.getSnapshot().currentIndex).toBe(1);
  expect(adapter.open).toHaveBeenCalledTimes(1);
  player.activate(second);
  sessions[0]({ type: "ended" });
  expect(player.getSnapshot().queue[player.getSnapshot().currentIndex!]).toBe(second);
  player.dispose();
  sessions[1]({ type: "play" });
  expect(player.getSnapshot().playing).toBe(false);
  expect(first.media.name).toBe("one");
});

it("removes selected entries while preserving or clearing the active session", () => {
  const sessions: Array<(event: PlaybackEvent) => void> = [];
  const adapter: PlaybackAdapter = {
    open: vi.fn((_url, notify) => sessions.push(notify)),
    play: vi.fn(async () => {}),
    pause: vi.fn(),
    seek: vi.fn(),
    setVolume: vi.fn(),
    clear: vi.fn(),
    dispose: vi.fn(),
  };
  const player = new PlayerController(adapter);
  player.add([
    { name: "one", url: "/one" },
    { name: "two", url: "/two" },
    { name: "three", url: "/three" },
  ]);
  const [first, second, third] = player.getSnapshot().queue;
  player.activate(third);
  player.select(first);
  player.removeSelected();
  expect(player.getSnapshot()).toMatchObject({
    queue: [second, third],
    selected: second,
    currentIndex: 1,
  });
  expect(adapter.clear).not.toHaveBeenCalled();

  player.select(third);
  sessions[1]({ type: "play" });
  player.removeSelected();
  expect(adapter.clear).toHaveBeenCalledOnce();
  expect(player.getSnapshot()).toMatchObject({
    queue: [second],
    selected: second,
    currentIndex: null,
    playing: false,
    time: 0,
    duration: 0,
  });
  sessions[1]({ type: "ended" });
  expect(player.getSnapshot().currentIndex).toBeNull();
  player.removeSelected();
  expect(player.getSnapshot()).toMatchObject({ queue: [], selected: null, currentIndex: null });
  player.dispose();
});
