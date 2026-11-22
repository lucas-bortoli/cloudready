/** Properties for a controlled horizontal slider. */
export interface TrackBarProps {
  /** Accessible name of the slider. */
  ariaLabel: string;
  value: number;
  onValueChange: (value: number) => void;
  range?: { min: number; max: number };
  step?: number;
  disabled?: boolean;
  title?: string;
  class?: string;
}

/**
 * Displays a controlled slider with pointer, touch, and keyboard input.
 * Arrow keys move by one step, Home and End select the bounds, and number
 * keys select a position from 0% through 90%.
 */
export default function TrackBar(props: TrackBarProps) {
  let activePointer: number | null = null;
  const min = () => props.range?.min ?? 0;
  const max = () => Math.max(min(), props.range?.max ?? 100);
  const step = () => {
    if (props.step && Number.isFinite(props.step) && props.step > 0) return props.step;
    return 1;
  };
  const value = () => Math.max(min(), Math.min(max(), props.value));
  const ariaDisabled = () => {
    if (props.disabled) return "true";
    return "false";
  };
  const thumbPosition = () => {
    if (max() === min()) return "0%";
    return `${((value() - min()) / (max() - min())) * 100}%`;
  };

  function snap(raw: number) {
    const snapped = min() + Math.round((raw - min()) / step()) * step();
    return Math.max(min(), Math.min(max(), Number(snapped.toPrecision(14))));
  }

  function updateFromPointer(event: PointerEvent) {
    const track = event.currentTarget as HTMLDivElement;
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    props.onValueChange(snap(min() + ratio * (max() - min())));
  }

  function handlePointerDown(event: PointerEvent) {
    if (
      props.disabled ||
      activePointer !== null ||
      (event.pointerType === "mouse" && event.button !== 0)
    )
      return;
    event.preventDefault();
    const track = event.currentTarget as HTMLDivElement;
    track.focus();
    activePointer = event.pointerId;
    track.setPointerCapture(event.pointerId);
    updateFromPointer(event);
  }

  function handlePointerMove(event: PointerEvent) {
    if (props.disabled || activePointer !== event.pointerId) return;
    updateFromPointer(event);
  }

  function handlePointerEnd(event: PointerEvent) {
    if (activePointer !== event.pointerId) return;
    activePointer = null;
    const track = event.currentTarget as HTMLDivElement;
    if (track.hasPointerCapture(event.pointerId)) track.releasePointerCapture(event.pointerId);
  }

  function handleLostPointerCapture(event: PointerEvent) {
    if (activePointer === event.pointerId) activePointer = null;
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (props.disabled) return;
    let next: number;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") next = snap(value() + step());
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown") next = snap(value() - step());
    else if (event.key === "Home") next = min();
    else if (event.key === "End") next = max();
    else if (/^[0-9]$/.test(event.key))
      next = snap(min() + (Number(event.key) / 10) * (max() - min()));
    else return;
    event.preventDefault();
    props.onValueChange(next);
  }

  return (
    <div
      role="slider"
      aria-label={props.ariaLabel}
      aria-valuemin={min()}
      aria-valuemax={max()}
      aria-valuenow={value()}
      aria-disabled={ariaDisabled()}
      tabindex="0"
      title={props.title}
      class={[
        "relative flex h-3 w-32 touch-none items-center outline-sky-300 focus:outline-2 focus:outline-offset-2",
        props.class,
        { "cursor-not-allowed opacity-50": props.disabled },
      ]}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onLostPointerCapture={handleLostPointerCapture}
    >
      <div
        aria-hidden="true"
        class="relative h-2 w-full rounded-xs border border-neutral-400 bg-neutral-100"
      >
        <div
          class="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 border border-neutral-400 bg-neutral-200 shadow-xs"
          style={{ left: `clamp(5px, ${thumbPosition()}, calc(100% - 5px))` }}
        />
      </div>
    </div>
  );
}
