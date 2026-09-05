type Bounds = { left: number; right: number; top: number; bottom: number };
type Point = { x: number; y: number };

// Trace both sides of every row and connecting corridor as one outer polygon.
export function connectedSectionOutlines(rows: Bounds[]): Point[][] {
  const groups: Bounds[][] = [];
  for (const row of rows) {
    const group = groups.at(-1);
    const previous = group?.at(-1);
    const left = previous ? Math.max(previous.left, row.left) : 0;
    const right = previous ? Math.min(previous.right, row.right) : 0;
    if (group && previous && right > left && row.top >= previous.bottom) {
      if (row.top > previous.bottom) {
        group.push({ left, right, top: previous.bottom, bottom: row.top });
      }
      group.push(row);
    } else {
      groups.push([row]);
    }
  }
  return groups.map((bands) => [
    ...bands.flatMap((band) => [
      { x: band.right, y: band.top },
      { x: band.right, y: band.bottom },
    ]),
    ...[...bands].reverse().flatMap((band) => [
      { x: band.left, y: band.bottom },
      { x: band.left, y: band.top },
    ]),
  ]);
}
