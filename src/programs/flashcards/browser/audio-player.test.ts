import { afterEach, describe, expect, it, vi } from "vitest";
import { createAudioPlayer } from "./audio-player";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("audio player", () => {
  it("plays available clips in order and releases URLs on replacement and disposal", () => {
    const created: HTMLAudioElement[] = [];
    const createUrl = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValueOnce("blob:first")
      .mockReturnValueOnce("blob:second")
      .mockReturnValueOnce("blob:third");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const pause = vi.fn();
    class FakeAudio {
      public onended: (() => void) | null = null;
      public pause = pause;
      public play = vi.fn().mockResolvedValue(undefined);
      public constructor() {
        created.push(this as unknown as HTMLAudioElement);
      }
    }
    vi.stubGlobal("Audio", FakeAudio);
    const player = createAudioPlayer();
    const media = { a: new Uint8Array([1]), b: new Uint8Array([2]) };
    player.play(["missing", "a", "b"], media);
    expect(createUrl).toHaveBeenCalledTimes(1);
    created[0].onended?.(new Event("ended"));
    expect(revoke).toHaveBeenCalledWith("blob:first");
    expect(createUrl).toHaveBeenCalledTimes(2);
    const previousEnded = created[1].onended;
    player.play(["a"], media);
    expect(revoke).toHaveBeenCalledWith("blob:second");
    previousEnded?.call(created[1], new Event("ended"));
    expect(createUrl).toHaveBeenCalledTimes(3);
    player.dispose();
    expect(revoke).toHaveBeenCalledWith("blob:third");
    expect(pause).toHaveBeenCalled();
  });
});
