import { formatIsoDateTime, parseIsoDateTime, type IsoDateTime } from "../../../lib/iso-date-time";
import generateUuid, { type Uuid } from "../../../lib/uuid";

export type Priority = "low" | "normal" | "urgent";

export type Bucket = "icebox" | "in-progress" | "blocked" | "revision" | "done";

export type CardId = Uuid<"Card">;

export type ProjectId = Uuid<"Project">;

export interface Project {
  id: ProjectId;
  title: string;
}

export interface Card {
  id: CardId;
  projectId: ProjectId;
  title: string;
  content: string;
  priority: Priority;
  expiration: IsoDateTime;
  bucket: Bucket;
  displayIndex: number;
}

export interface ProjectCreateOptions {
  title: string;
}

export interface CardCreateOptions {
  projectId: ProjectId;
  title: string;
  content?: string;
  priority?: Priority;
  expiration?: IsoDateTime;
  bucket?: Bucket;
  displayIndex?: number;
}

export interface CardUpdateOptions {
  title?: string;
  content?: string;
  priority?: Priority;
  expiration?: IsoDateTime;
}

export interface CardMoveOptions {
  bucket: Bucket;
  displayIndex: number;
}

export class ProjectNotFoundError extends Error {}

export class CardNotFoundError extends Error {}

export class InvalidModelJsonError extends Error {}

export type ModelChangeListener = () => void;

/** The public data model for Kodekai projects and cards. */
export class Model {
  private readonly projects = new Map<ProjectId, Project>();
  private readonly cards = new Map<CardId, Card>();
  private readonly changeListeners = new Set<ModelChangeListener>();

  /**
   * Creates a project.
   *
   * @returns The new project's ID.
   */
  public createProject(options: ProjectCreateOptions): ProjectId {
    const id = generateUuid<"Project">();
    this.projects.set(id, { id, title: options.title });
    this.notifyChange();
    return id;
  }

  /**
   * Returns a project by ID.
   *
   * @throws {ProjectNotFoundError} If no project has `id`.
   */
  public getProject(id: ProjectId): Project {
    return { ...this.requireProject(id) };
  }

  public listProjects(): readonly Project[] {
    return Array.from(this.projects.values(), (project) => ({ ...project }));
  }

  /**
   * Renames a project.
   *
   * @throws {ProjectNotFoundError} If no project has `id`.
   */
  public renameProject(id: ProjectId, title: string): void {
    this.requireProject(id).title = title;
    this.notifyChange();
  }

  /**
   * Deletes a project and all of its cards.
   *
   * @throws {ProjectNotFoundError} If no project has `id`.
   */
  public deleteProject(id: ProjectId): void {
    this.requireProject(id);
    this.projects.delete(id);

    for (const [cardId, card] of this.cards) {
      if (card.projectId === id) this.cards.delete(cardId);
    }
    this.notifyChange();
  }

  /**
   * Creates a card in a project.
   *
   * @returns The new card's ID.
   * @throws {ProjectNotFoundError} If no project has `options.projectId`.
   */
  public createCard(options: CardCreateOptions): CardId {
    this.requireProject(options.projectId);

    const id = generateUuid<"Card">();
    const bucket = options.bucket ?? "icebox";
    const card: Card = {
      id,
      projectId: options.projectId,
      title: options.title,
      content: options.content ?? "",
      priority: options.priority ?? "normal",
      expiration: options.expiration ?? formatIsoDateTime(new Date()),
      bucket,
      displayIndex: 0,
    };

    this.cards.set(id, card);
    this.insertCard(card, options.displayIndex);
    this.notifyChange();
    return id;
  }

  /**
   * Returns a card by ID.
   *
   * @throws {CardNotFoundError} If no card has `id`.
   */
  public getCard(id: CardId): Card {
    return { ...this.requireCard(id) };
  }

  /**
   * Lists the cards in one project, ordered by display index.
   *
   * @throws {ProjectNotFoundError} If no project has `projectId`.
   */
  public listCards(projectId: ProjectId): readonly Card[] {
    this.requireProject(projectId);
    return Array.from(this.cards.values())
      .filter((card) => card.projectId === projectId)
      .sort(
        (left, right) => left.displayIndex - right.displayIndex || left.id.localeCompare(right.id),
      )
      .map((card) => ({ ...card }));
  }

  /**
   * Changes card content without moving it.
   *
   * @throws {CardNotFoundError} If no card has `id`.
   */
  public updateCard(id: CardId, options: CardUpdateOptions): void {
    Object.assign(this.requireCard(id), options);
    this.notifyChange();
  }

  /**
   * Moves a card to a bucket and position within its project.
   *
   * @throws {CardNotFoundError} If no card has `id`.
   */
  public moveCard(id: CardId, options: CardMoveOptions): void {
    const card = this.requireCard(id);
    const oldBucket = card.bucket;
    const oldCards = this.cardsInBucket(card.projectId, oldBucket).filter((item) => item.id !== id);

    this.reindex(oldCards);
    card.bucket = options.bucket;
    this.insertCard(card, options.displayIndex);
    this.notifyChange();
  }

  /**
   * Deletes a card.
   *
   * @throws {CardNotFoundError} If no card has `id`.
   */
  public deleteCard(id: CardId): void {
    const card = this.requireCard(id);
    this.cards.delete(id);
    this.reindex(this.cardsInBucket(card.projectId, card.bucket));
    this.notifyChange();
  }

  /**
   * Registers a listener invoked after the model changes.
   *
   * @returns A function that unregisters `listener`.
   */
  public subscribe(listener: ModelChangeListener): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  /** Serializes this model to a portable JSON string. */
  public toJSON(): string {
    return JSON.stringify({
      projects: Array.from(this.projects.values()),
      cards: Array.from(this.cards.values()),
    });
  }

  /**
   * Restores a model from a JSON string produced by {@link Model.toJSON}.
   *
   * @throws {InvalidModelJsonError} If `json` is malformed or has an invalid model shape.
   */
  public static fromJSON(json: string): Model {
    let value: unknown;
    try {
      value = JSON.parse(json);
    } catch {
      throw new InvalidModelJsonError("Model JSON is malformed.");
    }

    if (!isRecord(value) || !Array.isArray(value.projects) || !Array.isArray(value.cards)) {
      throw new InvalidModelJsonError("Model JSON must contain projects and cards arrays.");
    }

    const model = Model.empty();
    for (const project of value.projects) model.addSerializedProject(project);
    for (const card of value.cards) model.addSerializedCard(card);
    return model;
  }

  /** Creates an empty model. */
  public static empty(): Model {
    return new Model();
  }

  private constructor() {}

  private requireProject(id: ProjectId): Project {
    const project = this.projects.get(id);
    if (!project) throw new ProjectNotFoundError(`Project ${id} does not exist.`);
    return project;
  }

  private requireCard(id: CardId): Card {
    const card = this.cards.get(id);
    if (!card) throw new CardNotFoundError(`Card ${id} does not exist.`);
    return card;
  }

  private cardsInBucket(projectId: ProjectId, bucket: Bucket): Card[] {
    return Array.from(this.cards.values())
      .filter((card) => card.projectId === projectId && card.bucket === bucket)
      .sort(
        (left, right) => left.displayIndex - right.displayIndex || left.id.localeCompare(right.id),
      );
  }

  private insertCard(card: Card, requestedIndex: number | undefined): void {
    const cards = this.cardsInBucket(card.projectId, card.bucket).filter(
      (item) => item.id !== card.id,
    );
    const index = Math.max(0, Math.min(Math.trunc(requestedIndex ?? cards.length), cards.length));
    cards.splice(index, 0, card);
    this.reindex(cards);
  }

  private reindex(cards: readonly Card[]): void {
    cards.forEach((card, displayIndex) => {
      card.displayIndex = displayIndex;
    });
  }

  private notifyChange(): void {
    for (const listener of this.changeListeners) listener();
  }

  private addSerializedProject(value: unknown): void {
    if (!isRecord(value) || typeof value.id !== "string" || typeof value.title !== "string") {
      throw new InvalidModelJsonError("Model JSON contains an invalid project.");
    }

    const id = value.id as ProjectId;
    if (this.projects.has(id))
      throw new InvalidModelJsonError("Model JSON contains duplicate project IDs.");
    this.projects.set(id, { id, title: value.title });
  }

  private addSerializedCard(value: unknown): void {
    if (!isSerializedCard(value)) {
      throw new InvalidModelJsonError("Model JSON contains an invalid card.");
    }

    try {
      const id = value.id as CardId;
      const projectId = value.projectId as ProjectId;
      if (this.cards.has(id) || !this.projects.has(projectId)) {
        throw new InvalidModelJsonError("Model JSON contains an invalid card reference.");
      }

      this.cards.set(id, {
        id,
        projectId,
        title: value.title,
        content: value.content,
        priority: value.priority,
        expiration: parseIsoDateTime(value.expiration),
        bucket: value.bucket,
        displayIndex: value.displayIndex,
      });
    } catch (error) {
      if (error instanceof InvalidModelJsonError) throw error;
      throw new InvalidModelJsonError("Model JSON contains an invalid card expiration.");
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

interface SerializedCard {
  id: string;
  projectId: string;
  title: string;
  content: string;
  priority: Priority;
  expiration: string;
  bucket: Bucket;
  displayIndex: number;
}

function isSerializedCard(value: unknown): value is SerializedCard {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === "string" &&
    typeof value.projectId === "string" &&
    typeof value.title === "string" &&
    typeof value.content === "string" &&
    (value.priority === "low" || value.priority === "normal" || value.priority === "urgent") &&
    typeof value.expiration === "string" &&
    (value.bucket === "icebox" ||
      value.bucket === "in-progress" ||
      value.bucket === "blocked" ||
      value.bucket === "revision" ||
      value.bucket === "done") &&
    typeof value.displayIndex === "number" &&
    Number.isInteger(value.displayIndex) &&
    value.displayIndex >= 0
  );
}
