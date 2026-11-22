import { createSignal, onSettled } from "solid-js";

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
});

export default function Clock() {
  const [time, setTime] = createSignal(new Date());

  onSettled(() => {
    let timer: number | undefined;

    const refresh = () => {
      setTime(new Date());
      timer = window.setTimeout(refresh, 60_000 - (Date.now() % 60_000));
    };

    timer = window.setTimeout(refresh, 60_000 - (Date.now() % 60_000));

    return () => {
      if (timer !== undefined) {
        window.clearTimeout(timer);
      }
    };
  });

  return (
    <time class="flex h-10 items-center px-3 tabular-nums" datetime={time().toISOString()}>
      {timeFormatter.format(time())}
    </time>
  );
}
