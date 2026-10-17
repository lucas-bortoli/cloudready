interface FairyIconColors {
  wingsFill: string;
  bodyFill: string;
  wingsOutline: string;
}

/** Creates the fairy icon data URL used by the shell. */
export default function createFairyIcon({ wingsFill, bodyFill, wingsOutline }: FairyIconColors) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 49 56"><path fill="${wingsFill}" stroke="${wingsOutline}" d="M25 37c0-16 32-48 32-32 0 16-16 32-32 32M25 37C25 21-7-11-7 5c0 16 16 32 32 32"/><circle cx="25" cy="37" r="16" fill="${bodyFill}" stroke="${wingsOutline}"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
