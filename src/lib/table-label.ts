// Base density on the rendered table, not the window: sidebars and floor zoom
// can shrink a table even on a large monitor.
export function tableLabelPresentation(width: number, height: number, scale: number, name: string) {
  const safeScale = Math.max(0.05, scale);
  const size = Math.min(width, height);
  const displayedSize = size * safeScale;
  const density = size < 64 || displayedSize < 54 ? "numbers" : displayedSize < 80 || safeScale < 0.85 ? "reduced" : "full";
  const numberSize = Math.min(18 / safeScale, size * 0.55, (size - 8) / (Math.max(2, name.length) * 0.65));
  return { density, numberSize };
}
