/**
 * Plays package audio in sequence and owns every audio object URL it creates.
 */
export interface AudioPlayer {
  /**
   * Replaces the current playlist with audio from the supplied package.
   */
  play(names: readonly string[], media: Readonly<Record<string, Uint8Array>>): void;
  /**
   * Stops playback and releases the current URL.
   */
  stop(): void;
  /**
   * Stops playback when the owning review controller is disposed.
   */
  dispose(): void;
}

/**
 * Creates an audio player whose generation counter prevents a stopped playlist
 * from advancing when a late `ended` event arrives.
 */
export function createAudioPlayer(): AudioPlayer {
  let audio: HTMLAudioElement | undefined;
  let url: string | undefined;
  let generation = 0;

  const stop = (): void => {
    generation += 1;
    if (audio) {
      audio.onended = null;
      audio.pause();
      audio = undefined;
    }
    if (url) {
      URL.revokeObjectURL(url);
      url = undefined;
    }
  };

  const play = (names: readonly string[], media: Readonly<Record<string, Uint8Array>>): void => {
    stop();
    const currentGeneration = generation;

    const playNext = (index: number): void => {
      if (currentGeneration !== generation || index >= names.length) {
        return;
      }
      const bytes = media[names[index]];
      if (!bytes) {
        playNext(index + 1);
        return;
      }
      if (url) {
        URL.revokeObjectURL(url);
      }
      url = URL.createObjectURL(new Blob([bytes.slice().buffer]));
      audio = new Audio(url);
      audio.onended = () => {
        playNext(index + 1);
      };
      // Autoplay can be denied by the browser; replay remains available to the user.
      void audio.play().catch(() => {});
    };

    playNext(0);
  };

  const dispose = (): void => {
    stop();
  };

  return { play, stop, dispose };
}
