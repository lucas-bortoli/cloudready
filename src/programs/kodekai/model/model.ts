import { formatIsoDateTime, parseIsoDateTime, type IsoDateTime } from "../../../lib/iso-date-time";
import generateUuid, { type Uuid } from "../../../lib/uuid";

export type Priority = "low" | "normal" | "urgent";

export type Bucket = "icebox" | "in-progress" | "blocked" | "revision" | "done";

export type CardId = Uuid<"Card">;

export type ProjectId = Uuid<"Project">;
export type TagId = Uuid<"Tag">;

export interface Tag {
  id: TagId;
  projectId: ProjectId;
  name: string;
}

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
  expiration: IsoDateTime | null;
  bucket: Bucket;
  displayIndex: number;
  tagIds: TagId[];
}

export interface ProjectCreateOptions {
  title: string;
}

export interface CardCreateOptions {
  projectId: ProjectId;
  title: string;
  content?: string;
  priority?: Priority;
  expiration?: IsoDateTime | null;
  bucket?: Bucket;
  displayIndex?: number;
  tagIds?: TagId[];
}

export interface CardUpdateOptions {
  title?: string;
  content?: string;
  priority?: Priority;
  expiration?: IsoDateTime | null;
  tagIds?: TagId[];
}

export interface CardMoveOptions {
  bucket: Bucket;
  displayIndex: number;
}

export class ProjectNotFoundError extends Error {}

export class CardNotFoundError extends Error {}

export class InvalidModelJsonError extends Error {}
export class TagNotFoundError extends Error {}
export class InvalidCardTagError extends Error {}
export class TagNameConflictError extends Error {}

export type ModelChangeListener = () => void;

/** The public data model for Kodekai projects and cards. */
export class Model {
  private readonly projects = new Map<ProjectId, Project>();
  private readonly cards = new Map<CardId, Card>();
  private readonly tags = new Map<TagId, Tag>();
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
    for (const [tagId, tag] of this.tags) {
      if (tag.projectId === id) this.tags.delete(tagId);
    }
    this.notifyChange();
  }

  /** Lists tags owned by a project.
   * @throws {ProjectNotFoundError} If the project does not exist.
   */
  public listTags(projectId: ProjectId): readonly Tag[] {
    this.requireProject(projectId);
    return Array.from(this.tags.values())
      .filter((tag) => tag.projectId === projectId)
      .map((tag) => ({ ...tag }));
  }

  /** Creates a project-scoped tag.
   * @throws {ProjectNotFoundError} If the project does not exist.
   * @throws {TagNameConflictError} If the name is empty or already used in the project.
   */
  public createTag(projectId: ProjectId, name: string): TagId {
    this.requireProject(projectId);
    const cleanName = this.validateTagName(projectId, name);
    const id = generateUuid<"Tag">();
    this.tags.set(id, { id, projectId, name: cleanName });
    this.notifyChange();
    return id;
  }

  /** Renames a tag.
   * @throws {TagNotFoundError} If the tag does not exist.
   * @throws {TagNameConflictError} If the name is empty or already used in the project.
   */
  public renameTag(id: TagId, name: string): void {
    const tag = this.requireTag(id);
    tag.name = this.validateTagName(tag.projectId, name, id);
    this.notifyChange();
  }

  /** Deletes a tag and removes it from cards.
   * @throws {TagNotFoundError} If the tag does not exist.
   */
  public deleteTag(id: TagId): void {
    this.requireTag(id);
    this.tags.delete(id);
    for (const card of this.cards.values())
      card.tagIds = card.tagIds.filter((tagId) => tagId !== id);
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
      expiration:
        options.expiration === undefined ? formatIsoDateTime(new Date()) : options.expiration,
      bucket,
      displayIndex: 0,
      tagIds: this.validateCardTags(options.projectId, options.tagIds ?? []),
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
    const card = this.requireCard(id);
    return { ...card, tagIds: [...card.tagIds] };
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
      .map((card) => ({ ...card, tagIds: [...card.tagIds] }));
  }

  /**
   * Changes card content without moving it.
   *
   * @throws {CardNotFoundError} If no card has `id`.
   * @throws {InvalidCardTagError} If a tag belongs to another project or is missing.
   */
  public updateCard(id: CardId, options: CardUpdateOptions): void {
    const card = this.requireCard(id);
    const changes = options.tagIds
      ? { ...options, tagIds: this.validateCardTags(card.projectId, options.tagIds) }
      : options;
    Object.assign(card, changes);
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
      tags: Array.from(this.tags.values()),
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
    if (value.tags !== undefined && !Array.isArray(value.tags)) {
      throw new InvalidModelJsonError("Model JSON contains invalid tags.");
    }
    for (const tag of value.tags ?? []) model.addSerializedTag(tag);
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

  private requireTag(id: TagId): Tag {
    const tag = this.tags.get(id);
    if (!tag) throw new TagNotFoundError(`Tag ${id} does not exist.`);
    return tag;
  }

  private validateTagName(projectId: ProjectId, name: string, exceptId?: TagId): string {
    const cleanName = name.trim();
    if (
      !cleanName ||
      Array.from(this.tags.values()).some(
        (tag) =>
          tag.projectId === projectId &&
          tag.id !== exceptId &&
          tag.name.toLowerCase() === cleanName.toLowerCase(),
      )
    )
      throw new TagNameConflictError("Tag names must be nonempty and unique within a project.");
    return cleanName;
  }

  private validateCardTags(projectId: ProjectId, tagIds: readonly TagId[]): TagId[] {
    if (
      new Set(tagIds).size !== tagIds.length ||
      tagIds.some((id) => this.tags.get(id)?.projectId !== projectId)
    ) {
      throw new InvalidCardTagError("Card tags must be unique and belong to the card's project.");
    }
    return [...tagIds];
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

  private addSerializedTag(value: unknown): void {
    if (
      !isRecord(value) ||
      typeof value.id !== "string" ||
      typeof value.projectId !== "string" ||
      typeof value.name !== "string"
    ) {
      throw new InvalidModelJsonError("Model JSON contains an invalid tag.");
    }
    const id = value.id as TagId;
    const projectId = value.projectId as ProjectId;
    if (this.tags.has(id) || !this.projects.has(projectId))
      throw new InvalidModelJsonError("Model JSON contains an invalid tag reference.");
    try {
      const name = this.validateTagName(projectId, value.name);
      this.tags.set(id, { id, projectId, name });
    } catch {
      throw new InvalidModelJsonError("Model JSON contains a duplicate or empty tag name.");
    }
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
        expiration: value.expiration === null ? null : parseIsoDateTime(value.expiration),
        bucket: value.bucket,
        displayIndex: value.displayIndex,
        tagIds: this.validateCardTags(projectId, (value.tagIds ?? []) as TagId[]),
      });
    } catch (error) {
      if (error instanceof InvalidModelJsonError) throw error;
      throw new InvalidModelJsonError("Model JSON contains an invalid card expiration or tag.");
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
  expiration: string | null;
  bucket: Bucket;
  displayIndex: number;
  tagIds?: string[];
}

function isSerializedCard(value: unknown): value is SerializedCard {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === "string" &&
    typeof value.projectId === "string" &&
    typeof value.title === "string" &&
    typeof value.content === "string" &&
    (value.priority === "low" || value.priority === "normal" || value.priority === "urgent") &&
    (typeof value.expiration === "string" || value.expiration === null) &&
    (value.bucket === "icebox" ||
      value.bucket === "in-progress" ||
      value.bucket === "blocked" ||
      value.bucket === "revision" ||
      value.bucket === "done") &&
    typeof value.displayIndex === "number" &&
    Number.isInteger(value.displayIndex) &&
    value.displayIndex >= 0 &&
    (value.tagIds === undefined ||
      (Array.isArray(value.tagIds) && value.tagIds.every((id) => typeof id === "string")))
  );
}
