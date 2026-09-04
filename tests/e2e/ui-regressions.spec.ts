import { expect, test, type Page } from "@playwright/test";

const serviceDate = "2026-09-04";
const shift = {
  id: 1,
  name: "Dinner",
  slug: "dinner",
  start_time: "17:00",
  end_time: "22:00",
  default_turn_minutes: 90,
};

const gridPayload = {
  restaurant: { id: 1, name: "Regression Test Dining Room" },
  training_mode: false,
  data_mode: "production",
  service_date: serviceDate,
  current_service_date: serviceDate,
  booking_allowed: true,
  shifts: [shift],
  selected_shift: shift,
  tables: [
    {
      id: 1,
      name: "1",
      capacity: 2,
      sort_order: 1,
      shape: "rectangle",
      position_x: 20,
      position_y: 45,
      width: 108,
      height: 76,
      rotation: 0,
      chair_layout: "across",
    },
    {
      id: 2,
      name: "2",
      capacity: 2,
      sort_order: 2,
      shape: "rectangle",
      position_x: 29,
      position_y: 45,
      width: 108,
      height: 76,
      rotation: 0,
      chair_layout: "across",
    },
  ],
  reservations: [],
  summary: { reservations: 0, covers: 0, seated: 0 },
};

async function mockGrid(page: Page, delayMs = 0) {
  await page.route("**/api/grid?*", async (route) => {
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(gridPayload) });
  });
}

test("reservation navigation is not overwritten by a late grid response", async ({ page }) => {
  await mockGrid(page, 600);
  await page.goto(`/reservations?date=${serviceDate}&shift=dinner`);

  await page.getByRole("link", { name: "Book a reservation" }).click();
  await expect(page).toHaveURL(new RegExp(`/reservations/book\\?date=${serviceDate}&shift=dinner$`));
  await expect(page.getByRole("heading", { name: "Find the right table" })).toBeVisible();

  await page.getByRole("link", { name: "Reservations" }).click();
  await expect(page).toHaveURL(new RegExp(`/reservations\\?date=${serviceDate}&shift=dinner$`));
});

test("floor changes can be undone and redone", async ({ page }) => {
  await mockGrid(page);
  await page.goto(`/floor?date=${serviceDate}&shift=dinner`);
  await page.getByRole("button", { name: "Edit Floor" }).click();

  const undo = page.getByRole("button", { name: "Undo last floor change" });
  const redo = page.getByRole("button", { name: "Redo last floor change" });
  await expect(undo).toBeDisabled();
  await expect(redo).toBeDisabled();

  const table = page.getByRole("button", { name: /Table 1, 2 seats, rectangle/ });
  const before = await table.boundingBox();
  expect(before).not.toBeNull();

  await table.dragTo(page.locator(".floor-canvas-stage"), {
    targetPosition: { x: 100, y: 100 },
  });

  const after = await table.boundingBox();
  expect(after).not.toBeNull();
  expect(Math.hypot(after!.x - before!.x, after!.y - before!.y)).toBeGreaterThan(20);

  await expect(undo).toBeEnabled();
  await undo.click();
  const undone = await table.boundingBox();
  expect(undone).not.toBeNull();
  expect(Math.hypot(undone!.x - before!.x, undone!.y - before!.y)).toBeLessThan(2);

  await expect(redo).toBeEnabled();
  await redo.click();
  const redone = await table.boundingBox();
  expect(redone).not.toBeNull();
  expect(Math.hypot(redone!.x - after!.x, redone!.y - after!.y)).toBeLessThan(2);

  await page.getByRole("button", { name: "Rotate selected tables right 15 degrees" }).click();
  await expect(table.getByText("15°")).toBeVisible();
  await undo.click();
  await expect(table.getByText("0°")).toBeVisible();
  await redo.click();
  await expect(table.getByText("15°")).toBeVisible();

  const floorTables = page.locator("[data-floor-table-id]");
  await page.getByRole("button", { name: "New Table" }).click();
  await expect(floorTables).toHaveCount(3);
  await undo.click();
  await expect(floorTables).toHaveCount(2);
  await redo.click();
  await expect(floorTables).toHaveCount(3);
});
