// @vitest-environment happy-dom

import { createMemo } from "solid-js";
import { render } from "solid-js/web";
import { describe, expect, it } from "vitest";
import { formatIsoDateTime } from "../../lib/iso-date-time";
import { type Bucket, Model, type ProjectId } from "./model/model";
import { KodekaiProvider, useKodekai } from "./KodekaiContext";

function ProjectCount() {
  const model = useKodekai();
  return <output>{model().listProjects().length}</output>;
}

function BucketCount(props: { bucket: Bucket; projectId: ProjectId }) {
  const model = useKodekai();
  const cards = createMemo(() =>
    model()
      .listCards(props.projectId)
      .filter((card) => card.bucket === props.bucket),
  );
  return <output>{cards().length}</output>;
}

describe("KodekaiProvider", () => {
  it("updates consumers after a model mutation", () => {
    const model = Model.empty();
    const container = document.createElement("div");
    document.body.append(container);
    const dispose = render(
      () => (
        <KodekaiProvider model={model}>
          <ProjectCount />
        </KodekaiProvider>
      ),
      container,
    );

    model.createProject({ title: "Cloudready" });

    expect(container.textContent).toBe("1");
    dispose();
    container.remove();
  });

  it("updates a rendered bucket after moving a card", () => {
    const model = Model.empty();
    const projectId = model.createProject({ title: "Cloudready" });
    const cardId = model.createCard({
      projectId,
      title: "Ship it",
      expiration: formatIsoDateTime(new Date()),
    });
    const container = document.createElement("div");
    document.body.append(container);
    const dispose = render(
      () => (
        <KodekaiProvider model={model}>
          <BucketCount bucket="icebox" projectId={projectId} />
          <BucketCount bucket="in-progress" projectId={projectId} />
        </KodekaiProvider>
      ),
      container,
    );

    model.moveCard(cardId, { bucket: "in-progress", displayIndex: 0 });

    expect(container.textContent).toBe("01");
    dispose();
    container.remove();
  });
});
