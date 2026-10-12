import { describe, expect, it } from "vitest";
import { formatIsoDateTime } from "../../../lib/iso-date-time";
import { Model } from "../model/model";
import { visibleCards, type CardViewOptions } from "./cardView";

describe("visibleCards", () => {
  it("filters by text, priority, date, and project tag without mutating order", () => {
    const model = Model.empty();
    const projectId = model.createProject({ title: "Work" });
    const tagId = model.createTag(projectId, "Frontend");
    model.createCard({
      projectId,
      title: "Build UI",
      content: "Search panel",
      priority: "urgent",
      tagIds: [tagId],
      expiration: formatIsoDateTime(new Date("2026-10-10T12:00:00Z")),
    });
    model.createCard({
      projectId,
      title: "Write API",
      priority: "low",
      expiration: formatIsoDateTime(new Date("2026-10-20T12:00:00Z")),
    });
    const cards = model.listCards(projectId);
    const options: CardViewOptions = {
      query: "SEARCH",
      priority: "urgent",
      due: "overdue",
      tagId,
      sort: "priority",
      today: new Date("2026-10-12T12:00:00Z"),
    };

    expect(visibleCards(cards, options).map((card) => card.title)).toEqual(["Build UI"]);
    expect(model.listCards(projectId)).toEqual(cards);
  });

  it("sorts due dates and priorities with manual order as the tie breaker", () => {
    const model = Model.empty();
    const projectId = model.createProject({ title: "Work" });
    model.createCard({
      projectId,
      title: "Low",
      priority: "low",
      expiration: formatIsoDateTime(new Date("2026-10-20T12:00:00Z")),
    });
    model.createCard({
      projectId,
      title: "Urgent",
      priority: "urgent",
      expiration: formatIsoDateTime(new Date("2026-10-21T12:00:00Z")),
    });
    const cards = model.listCards(projectId);
    const options: CardViewOptions = {
      query: "",
      priority: "all",
      due: "all",
      tagId: undefined,
      sort: "priority",
      today: new Date(),
    };

    expect(visibleCards(cards, options).map((card) => card.title)).toEqual(["Urgent", "Low"]);
    expect(visibleCards(cards, { ...options, sort: "due-date" }).map((card) => card.title)).toEqual(
      ["Low", "Urgent"],
    );
    expect(visibleCards(cards, { ...options, sort: "manual" }).map((card) => card.title)).toEqual([
      "Low",
      "Urgent",
    ]);
  });
});
