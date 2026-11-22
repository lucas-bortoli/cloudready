// @vitest-environment happy-dom

import { captureArtifact, expectNoDiagnostics } from "@solidjs/diagnostics";
import { createMemo, createSignal, flush } from "solid-js";
import { render } from "@solidjs/web";
import { describe, expect, it, vi } from "vitest";
import { formatIsoDateTime } from "../../lib/iso-date-time";
import { type Bucket, Model, type ProjectId } from "./model/model";
import { KodekaiProvider, useKodekai } from "./KodekaiContext";

function ProjectCount() {
  const model = useKodekai();
  return <output>Projects: {model().listProjects().length}</output>;
}

function BucketCount(props: { bucket: Bucket; projectId: ProjectId }) {
  const model = useKodekai();
  const cards = createMemo(() =>
    model()
      .listCards(props.projectId)
      .filter((card) => card.bucket === props.bucket),
  );
  return <output>Cards: {cards().length}</output>;
}

describe("KodekaiProvider", () => {
  it("updates consumers after a model mutation", async () => {
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

    await Promise.resolve();
    flush();
    model.createProject({ title: "Cloudready" });
    flush();

    expect(container.textContent).toBe("Projects: 1");
    dispose();
    container.remove();
  });

  it("updates a rendered bucket after moving a card", async () => {
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

    await Promise.resolve();
    flush();
    model.moveCard(cardId, { bucket: "in-progress", displayIndex: 0 });
    flush();

    expect(container.textContent).toBe("Cards: 0Cards: 1");
    dispose();
    container.remove();
  });

  it("switches subscriptions when the model changes and unsubscribes on disposal", async () => {
    const { artifact } = await captureArtifact(
      async () => {
        const first = Model.empty();
        const second = Model.empty();
        const firstUnsubscribe = vi.fn();
        const secondUnsubscribe = vi.fn();
        const firstSubscribe = first.subscribe.bind(first);
        const secondSubscribe = second.subscribe.bind(second);
        vi.spyOn(first, "subscribe").mockImplementation((listener) => {
          const unsubscribe = firstSubscribe(listener);
          return () => {
            firstUnsubscribe();
            unsubscribe();
          };
        });
        vi.spyOn(second, "subscribe").mockImplementation((listener) => {
          const unsubscribe = secondSubscribe(listener);
          return () => {
            secondUnsubscribe();
            unsubscribe();
          };
        });
        const container = document.createElement("div");
        let setModel!: (model: Model) => Model;
        const dispose = render(() => {
          const [model, updateModel] = createSignal(first);
          setModel = updateModel;
          return (
            <KodekaiProvider model={model()}>
              <ProjectCount />
            </KodekaiProvider>
          );
        }, container);
        await Promise.resolve();
        flush();
        first.createProject({ title: "First" });
        flush();
        expect(container.textContent).toBe("Projects: 1");
        setModel(second);
        flush();
        expect(firstUnsubscribe).toHaveBeenCalledOnce();
        expect(container.textContent).toBe("Projects: 0");
        second.createProject({ title: "Second" });
        flush();
        expect(container.textContent).toBe("Projects: 1");
        dispose();
        expect(secondUnsubscribe).toHaveBeenCalledOnce();
      },
      { scenario: "kodekai-model-subscription" },
    );
    expectNoDiagnostics(artifact);
  });
});
