import { formatIsoDateTime } from "../../../lib/iso-date-time";
import { type Bucket, type Priority, Model } from "./model";

interface MockCard {
  title: string;
  content: string;
  priority: Priority;
  expiration: string;
  bucket: Bucket;
}

const mockCards: readonly MockCard[] = [
  {
    title: "Prepare kickoff notes",
    content: "Outline scope, milestones, and the questions to resolve with the team.",
    priority: "urgent",
    expiration: "2026-10-02T15:00:00.000Z",
    bucket: "in-progress",
  },
  {
    title: "Review navigation prototype",
    content: "Check keyboard navigation and the window layout at smaller sizes.",
    priority: "normal",
    expiration: "2026-10-06T15:00:00.000Z",
    bucket: "revision",
  },
  {
    title: "Collect launch assets",
    content: "Request the final logo, screenshots, and product copy.",
    priority: "low",
    expiration: "2026-10-09T15:00:00.000Z",
    bucket: "icebox",
  },
];

/** Creates deterministic sample data for developing the Kodekai interface. */
export function createMockModel(): Model {
  const model = Model.empty();
  const projectId = model.createProject({ title: "Cloudready launch" });

  for (const card of mockCards) {
    model.createCard({
      projectId,
      ...card,
      expiration: formatIsoDateTime(new Date(card.expiration)),
    });
  }

  return model;
}
