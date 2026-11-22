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
    setMuted: vi.fn(),
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
