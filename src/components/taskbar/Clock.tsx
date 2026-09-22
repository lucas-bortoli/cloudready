import { createSignal, onCleanup, onMount } from "solid-js";

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
});

export default function Clock() {
  const [time, setTime] = createSignal(new Date());

  onMount(() => {
    let timer: number | undefined;

    const refresh = () => {
      setTime(new Date());
      timer = window.setTimeout(refresh, 60_000 - (Date.now() % 60_000));
    };

    timer = window.setTimeout(refresh, 60_000 - (Date.now() % 60_000));

    onCleanup(() => {
      if (timer !== undefined) {
        window.clearTimeout(timer);
      }
    });
  });

  return (
    <time class="ml-auto flex h-10 items-center px-3 tabular-nums" dateTime={time().toISOString()}>
      {timeFormatter.format(time())}
    </time>
  );
}
