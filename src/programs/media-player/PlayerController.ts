/**
 * A media resource playable by the browser.
 */
export interface MediaDescriptor {
  name: string;
  url: string;
}
/**
 * A unique occurrence of a resource in the queue.
 */
export interface QueueItem {
  readonly media: MediaDescriptor;
}
/**
 * Observable player state.
 */
export interface PlayerSnapshot {
  queue: readonly QueueItem[];
  selected: QueueItem | null;
  currentIndex: number | null;
  playing: boolean;
  volume: number;
  time: number;
  duration: number;
  error: "playback" | "start" | null;
}
/**
 * Browser operations used by the player controller.
 */
export interface PlaybackAdapter {
  /**
   * Opens a new media session and forwards its events.
   *
   * @param url The media resource URL.
   * @param notify Receives events from the session.
   */
  open(url: string, notify: (event: PlaybackEvent) => void): void;
  /**
   * Starts or resumes playback.
   *
   * @returns A promise that resolves when playback starts.
   */
  play(): Promise<void>;
  /**
   * Pauses playback.
   */
  pause(): void;
  /**
   * Changes the playback position.
   *
   * @param time The position in seconds.
   */
  seek(time: number): void;
  /**
   * Sets the volume.
   *
   * @param volume The volume level from 0 to 1.
   */
  setVolume(volume: number): void;
  /**
   * Releases the active media session while keeping the adapter available.
   */
  clear(): void;
  /**
   * Releases playback resources.
   */
  dispose(): void;
}
/**
 * Events from the active playback session.
 */
export type PlaybackEvent =
  { type: "play" | "pause" | "ended" | "error" } | { type: "time"; time: number; duration: number };

/**
 * Manages queue and playback independently of any user interface.
 */
export default class PlayerController {
  private state: PlayerSnapshot = {
    queue: [],
    selected: null,
    currentIndex: null,
    playing: false,
    volume: 1,
    time: 0,
    duration: 0,
    error: null,
  };
  private listeners = new Set<() => void>();
  private generation = 0;
  private disposed = false;

  private readonly adapter: PlaybackAdapter;

  /**
   * Creates a player using the supplied playback adapter.
   *
   * @param adapter The backend used to play media and receive events.
   */
  public constructor(adapter: PlaybackAdapter) {
    this.adapter = adapter;
  }

  /**
   * Returns the current immutable state snapshot.
   */
  public getSnapshot(): PlayerSnapshot {
    return this.state;
  }

  /**
   * Registers a change listener and returns a function that removes it.
   */
  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private update(change: Partial<PlayerSnapshot>): void {
    if (this.disposed) return;
    this.state = { ...this.state, ...change };
    this.listeners.forEach((listener) => listener());
  }

  /**
   * Appends entries and starts the first one when the queue was empty.
   */
  public add(media: readonly MediaDescriptor[]): void {
    const items = media.map((item) => ({ media: item }));
    const wasEmpty = this.state.queue.length === 0;
    this.update({ queue: [...this.state.queue, ...items] });
    if (wasEmpty && items[0]) this.activate(items[0]);
  }

  /**
   * Selects a queue entry without changing playback.
   */
  public select(item: QueueItem): void {
    if (this.state.queue.includes(item)) this.update({ selected: item });
  }

  /**
   * Removes the selected entry, stopping playback if it was the active entry.
   * Selects the next entry, or the previous one when removing the last entry.
   */
  public removeSelected(): void {
    if (this.disposed) return;
    const index = this.state.queue.indexOf(this.state.selected as QueueItem);
    if (index < 0) return;

    const queue = this.state.queue.filter((_, itemIndex) => itemIndex !== index);
    const selected = queue[index] ?? queue[index - 1] ?? null;
    const currentIndex = this.state.currentIndex;
    if (currentIndex === index) {
      this.generation++;
      this.adapter.clear();
      this.update({
        queue,
        selected,
        currentIndex: null,
        playing: false,
        time: 0,
        duration: 0,
        error: null,
      });
    } else {
      let nextCurrentIndex = currentIndex;
      if (currentIndex !== null && index < currentIndex) nextCurrentIndex = currentIndex - 1;
      this.update({ queue, selected, currentIndex: nextCurrentIndex });
    }
  }

  /**
   * Starts a queue entry.
   */
  public activate(item: QueueItem): void {
    const index = this.state.queue.indexOf(item);
    if (index < 0 || this.disposed) return;
    const session = ++this.generation;
    this.update({
      currentIndex: index,
      selected: item,
      time: 0,
      duration: 0,
      playing: false,
      error: null,
    });
    this.adapter.open(item.media.url, (event) => {
      if (session !== this.generation || this.disposed) return;
      if (event.type === "time") this.update({ time: event.time, duration: event.duration });
      else if (event.type === "play") this.update({ playing: true });
      else if (event.type === "pause") this.update({ playing: false });
      else if (event.type === "error") this.update({ playing: false, error: "playback" });
      else {
        this.update({ playing: false });
        this.step(1);
      }
    });
    void this.play();
  }

  /**
   * Moves the selected entry while retaining the currently playing entry.
   */
  public move(direction: -1 | 1): void {
    const queue = [...this.state.queue];
    const index = queue.indexOf(this.state.selected as QueueItem);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= queue.length) return;
    // Resolve the current index after the swap so playback keeps its identity.
    const current = this.state.currentIndex === null ? null : queue[this.state.currentIndex];
    [queue[index], queue[target]] = [queue[target], queue[index]];
    this.update({ queue, currentIndex: current ? queue.indexOf(current) : null });
  }

  /**
   * Starts the adjacent entry when one exists.
   */
  public step(direction: -1 | 1): void {
    if (this.state.currentIndex === null) return;
    const item = this.state.queue[this.state.currentIndex + direction];
    if (item) this.activate(item);
  }

  /**
   * Starts or resumes the current entry.
   */
  public async play(): Promise<void> {
    if (this.state.currentIndex === null || this.disposed) return;
    const session = this.generation;
    this.update({ error: null });
    try {
      await this.adapter.play();
    } catch {
      if (session === this.generation) this.update({ error: "start" });
    }
  }

  /**
   * Pauses playback at its current position.
   */
  public pause(): void {
    this.adapter.pause();
  }

  /**
   * Pauses and returns the current entry to its beginning.
   */
  public stop(): void {
    this.adapter.pause();
    this.adapter.seek(0);
    this.update({ time: 0 });
  }

  /**
   * Seeks to a position in seconds.
   */
  public seek(time: number): void {
    this.adapter.seek(time);
    this.update({ time });
  }

  /**
   * Sets the volume between zero and one.
   */
  public setVolume(volume: number): void {
    this.adapter.setVolume(volume);
    this.update({ volume });
  }

  /**
   * Releases playback resources and subscriptions.
   */
  public dispose(): void {
    this.generation++;
    this.disposed = true;
    this.listeners.clear();
    this.adapter.dispose();
  }
}
