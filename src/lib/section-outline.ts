type Bounds = { left: number; right: number; top: number; bottom: number };
type Point = { x: number; y: number };

// Trace both sides of every row and connecting corridor as one outer polygon.
export function connectedSectionOutlines(rows: Bounds[], obstacles: Bounds[] = []): Point[][] {
  const groups: Bounds[][] = [];
  for (const row of rows) {
    const group = groups.at(-1);
    const previous = group?.at(-1);
    const left = previous ? Math.max(previous.left, row.left) : 0;
    const right = previous ? Math.min(previous.right, row.right) : 0;
    const blocked = previous && obstacles.some((obstacle) =>
      obstacle.left < right && obstacle.right > left &&
      obstacle.top < row.top && obstacle.bottom > previous.bottom,
    );
    if (group && previous && right > left && !blocked) {
      if (row.top > previous.bottom) {
        group.push({ left, right, top: previous.bottom, bottom: row.top });
      }
      group.push(row);
    } else {
      groups.push([row]);
    }
  }
  return groups.map((group) => {
    // Padded rows can overlap vertically. Sweep their edges to trace the union,
    // rather than drawing each overlapping rectangle as a separate outline.
    const edges = [...new Set(group.flatMap((band) => [band.top, band.bottom]))].sort((a, b) => a - b);
    const bands: Bounds[] = [];
    for (let index = 0; index < edges.length - 1; index++) {
      const top = edges[index];
      const bottom = edges[index + 1];
      const active = group.filter((band) => band.top < bottom && band.bottom > top);
      if (!active.length) continue;
      bands.push({
        top, bottom,
        left: Math.min(...active.map((band) => band.left)),
        right: Math.max(...active.map((band) => band.right)),
      });
    }
    return [
    ...bands.flatMap((band) => [
      { x: band.right, y: band.top },
      { x: band.right, y: band.bottom },
    ]),
    ...[...bands].reverse().flatMap((band) => [
      { x: band.left, y: band.bottom },
      { x: band.left, y: band.top },
    ]),
    ];
  });
}
