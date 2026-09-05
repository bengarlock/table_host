import assert from "node:assert/strict";
import { test } from "node:test";
import { tableLabelPresentation } from "../src/lib/table-label.ts";

test("labels progressively prioritize table numbers as the floor scales down", () => {
  assert.equal(tableLabelPresentation(108, 90, 1, "17").density, "full");
  assert.equal(tableLabelPresentation(108, 90, 0.7, "17").density, "reduced");
  const small = tableLabelPresentation(108, 90, 0.45, "17");
  assert.equal(small.density, "numbers");
  assert.equal(small.numberSize * 0.45, 18);
});

test("small tables and long names stay within their table bounds", () => {
  const label = tableLabelPresentation(40, 80, 1, "BAR123");
  assert.equal(label.density, "numbers");
  assert.ok(label.numberSize * 6 * 0.65 <= 32);
});
