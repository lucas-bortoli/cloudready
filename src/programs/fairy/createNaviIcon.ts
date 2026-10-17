import naviSvg from "./navi.svg?raw";

interface NaviIconColors {
  wingsFill: string;
  bodyFill: string;
  wingsOutline: string;
}

/** Creates a Navi icon data URL with its placeholder colors replaced. */
export default function createNaviIcon({ wingsFill, bodyFill, wingsOutline }: NaviIconColors) {
  const svg = naviSvg
    .replaceAll("#00ffff", wingsFill)
    .replaceAll("#ff00ff", bodyFill)
    .replaceAll("#ff007f", wingsOutline);

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
