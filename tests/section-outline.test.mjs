import assert from "node:assert/strict";
import { test } from "node:test";
import { connectedSectionOutlines } from "../src/lib/section-outline.ts";

test("overlapping vertical rows have one outer border", () => {
  const rows = Array.from({ length: 7 }, (_, index) => ({
    left: 900, right: 1050, top: index * 80, bottom: index * 80 + 130,
  }));
  const paths = connectedSectionOutlines(rows);
  assert.equal(paths.length, 1);
  assert.ok(paths[0].every((point) => point.x === 900 || point.x === 1050));
  assert.equal(Math.max(...paths[0].map((point) => point.y)), 610);
});

test("horizontal rows and clear connecting corridors remain connected", () => {
  assert.equal(connectedSectionOutlines([
    { left: 0, right: 600, top: 0, bottom: 130 },
    { left: 0, right: 150, top: 250, bottom: 380 },
  ]).length, 1);
});

test("another section blocks a connecting corridor", () => {
  assert.equal(connectedSectionOutlines([
    { left: 0, right: 600, top: 0, bottom: 130 },
    { left: 0, right: 800, top: 500, bottom: 630 },
  ], [{ left: 0, right: 650, top: 250, bottom: 380 }]).length, 2);
});
