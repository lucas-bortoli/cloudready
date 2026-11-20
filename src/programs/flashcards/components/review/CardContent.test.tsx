import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { describe, expect, it, vi } from "vitest";
import * as documents from "../../browser/card-document";
import type { RenderedCard } from "../../core/template";
import CardContent from "./CardContent";

describe("card content", () => {
  it("retains the current document on unrelated updates and releases URLs on replacement and disposal", () => {
    const create = vi
      .spyOn(documents, "cardDocument")
      .mockReturnValueOnce({ body: document.createElement("div"), css: "", urls: ["blob:front"] })
      .mockReturnValueOnce({ body: document.createElement("div"), css: "", urls: ["blob:back"] });
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const card: RenderedCard = {
      front: "front",
      back: "back",
      css: "",
      frontAudio: [],
      backAudio: [],
    };
    const media = {};
    let setRevealed!: (value: boolean) => boolean;
    let setOther!: (value: number) => number;
    const root = document.createElement("div");
    const dispose = render(() => {
      const [revealed, updateRevealed] = createSignal(false);
      const [other, updateOther] = createSignal(0);
      setRevealed = updateRevealed;
      setOther = updateOther;
      return (
        <>
          <span>{other()}</span>
          <CardContent card={card} media={media} revealed={revealed()} />
        </>
      );
    }, root);
    setOther(1);
    expect(create).toHaveBeenCalledTimes(1);
    setRevealed(true);
    expect(revoke).toHaveBeenCalledWith("blob:front");
    dispose();
    expect(revoke).toHaveBeenCalledWith("blob:back");
    vi.restoreAllMocks();
  });
});
