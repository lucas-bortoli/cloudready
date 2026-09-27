import { describe, expect, it, vi } from "vitest";
import { formatIsoDateTime } from "../../lib/iso-date-time";
import { InvalidModelJsonError, Model } from "./data";

const expiration = formatIsoDateTime(new Date("2026-09-27T15:30:00.000Z"));

describe("Model", () => {
  it("keeps card positions contiguous within each bucket", () => {
    const model = Model.empty();
    const projectId = model.createProject({ title: "Website" });
    const firstId = model.createCard({ projectId, title: "First", expiration });
    const secondId = model.createCard({ projectId, title: "Second", expiration });

    model.moveCard(secondId, { bucket: "icebox", displayIndex: 0 });

    expect(model.getCard(secondId).displayIndex).toBe(0);
    expect(model.getCard(firstId).displayIndex).toBe(1);
  });

  it("does not expose mutable stored records", () => {
    const model = Model.empty();
    const projectId = model.createProject({ title: "Website" });
    const project = model.getProject(projectId);

    project.title = "Changed outside the model";

    expect(model.getProject(projectId).title).toBe("Website");
  });

  it("notifies subscribers after mutations", () => {
    const model = Model.empty();
    const onChange = vi.fn();
    const unsubscribe = model.subscribe(onChange);

    const projectId = model.createProject({ title: "Website" });
    model.renameProject(projectId, "Cloudready");
    unsubscribe();
    model.deleteProject(projectId);

    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("round-trips its data through JSON", () => {
    const model = Model.empty();
    const projectId = model.createProject({ title: "Website" });
    const cardId = model.createCard({
      projectId,
      title: "Ship it",
      expiration,
      priority: "urgent",
    });

    const restored = Model.fromJSON(model.toJSON());

    expect(restored.getProject(projectId)).toEqual(model.getProject(projectId));
    expect(restored.getCard(cardId)).toEqual(model.getCard(cardId));
  });

  it("rejects malformed model JSON", () => {
    expect(() => Model.fromJSON("not json")).toThrow(InvalidModelJsonError);
  });
});
