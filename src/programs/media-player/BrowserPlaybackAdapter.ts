import type { PlaybackAdapter, PlaybackEvent } from "./PlayerController";

/**
 * Owns the browser media element and attaches it to a skin's video surface.
 */
export default class BrowserPlaybackAdapter implements PlaybackAdapter {
  private element: HTMLVideoElement | null = null;
  private surface: HTMLElement | null = null;
  private volume = 1;

  /**
   * Places the active video element inside the supplied surface.
   *
   * @param surface The container that displays the active video.
   */
  public attach(surface: HTMLElement): void {
    this.surface = surface;
    if (this.element) surface.append(this.element);
  }

  /**
   * Replaces the active media session and forwards its events.
   *
   * @param url The URL of the media resource to load.
   * @param notify Receives playback events from the new session.
   */
  public open(url: string, notify: (event: PlaybackEvent) => void): void {
    this.release();
    const video = document.createElement("video");
    video.playsInline = true;
    video.volume = this.volume;
    video.addEventListener("play", () => notify({ type: "play" }));
    video.addEventListener("pause", () => notify({ type: "pause" }));
    video.addEventListener("ended", () => notify({ type: "ended" }));
    video.addEventListener("error", () => notify({ type: "error" }));
    const updateTime = () =>
      notify({
        type: "time",
        time: video.currentTime,
        duration: Number.isFinite(video.duration) ? video.duration : 0,
      });
    video.addEventListener("timeupdate", updateTime);
    video.addEventListener("durationchange", updateTime);
    this.element = video;
    this.surface?.append(video);
    video.src = url;
    video.load();
  }

  /**
   * Starts playback of the active session, restarting it if it has ended.
   *
   * @returns A promise that resolves when playback starts.
   */
  public async play(): Promise<void> {
    if (this.element) {
      if (this.element.ended) this.element.currentTime = 0;
      await this.element.play();
    }
  }

  /**
   * Pauses the active session.
   */
  public pause(): void {
    this.element?.pause();
  }

  /**
   * Changes the playback position.
   *
   * @param time The position in seconds.
   */
  public seek(time: number): void {
    if (this.element) this.element.currentTime = time;
  }

  /**
   * Sets the volume for the current and subsequent sessions.
   *
   * @param volume The volume level from 0 to 1.
   */
  public setVolume(volume: number): void {
    this.volume = volume;
    if (this.element) this.element.volume = volume;
  }

  private release(): void {
    if (!this.element) return;
    this.element.pause();
    this.element.removeAttribute("src");
    this.element.load();
    this.element.remove();
    this.element = null;
  }

  /**
   * Releases the active media session while retaining its video surface.
   */
  public clear(): void {
    this.release();
  }

  /**
   * Releases the active media element and its video surface.
   */
  public dispose(): void {
    this.release();
    this.surface = null;
  }
}
