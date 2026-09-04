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

for (const futureDate of [true, false]) {
  test(`reservation seating is ${futureDate ? "blocked for future dates" : "available today"}`, async ({ page }) => {
    // The server's restaurant date is authoritative, even when the browser is ahead.
    await page.clock.setFixedTime(new Date("2026-09-04T12:00:00Z"));
    const reservation = {
      id: 101, table_id: 1, table_name: "1", table_ids: [1], table_names: ["1"],
      guest_name: "Future Guest", party_size: 2, start_time: "17:00", duration_minutes: 90,
      status: "confirmed", assignment_type: "soft", guest_tags: [], tags: [], notes: "",
    };
    let updates = 0;
    await page.route("**/api/grid?*", (route) => route.fulfill({
      json: { ...gridPayload, current_service_date: futureDate ? "2026-09-03" : serviceDate,
        reservations: [reservation], summary: { reservations: 1, covers: 2, seated: 0 } },
    }));
    await page.route("**/api/grid/reservations/101/moves", (route) => route.fulfill({ json: [] }));
    await page.route("**/api/grid/reservations/101", async (route) => {
      updates++;
      await route.fulfill({ json: { ...reservation, status: "seated" } });
    });
    await page.goto(`/reservations?date=${serviceDate}&shift=dinner`);
    await page.getByRole("button", { name: /Future Guest, party of 2/ }).click();
    const seat = page.getByRole("button", { name: "Mark seated", exact: true });
    if (futureDate) {
      await expect(seat).toBeDisabled();
      await expect(page.getByRole("button", { name: "Complete", exact: true })).toBeDisabled();
      await expect(page.getByText("Reservations cannot be seated or marked as served on future dates.")).toBeVisible();
      await expect(page.getByRole("button", { name: "Cancel reservation", exact: true })).toBeEnabled();
      expect(updates).toBe(0);
      await page.goto(`/floor?date=${serviceDate}&shift=dinner`);
      await expect(page.getByText("Viewing another service date. Return to today to seat parties or change table statuses.")).toBeVisible();
      await expect(page.getByRole("button", { name: "Seat", exact: true })).toBeDisabled();
      await expect(page.getByRole("button", { name: "Walk In", exact: true })).toBeDisabled();
      await expect(page.locator(".floor-reservation-move-indicator")).toHaveCount(0);
    } else {
      await expect(seat).toBeEnabled();
      await seat.click();
      await expect(seat).toHaveCount(0);
      expect(updates).toBe(1);
      await page.goto(`/floor?date=${serviceDate}&shift=dinner`);
      await expect(page.locator(".floor-reservation-move-indicator")).toHaveCount(1);
    }
  });
}

async function mockAvailability(page: Page) {
  await page.route("**/api/grid/availability?*", async (route) => {
    const requestedPartySize = Number(new URL(route.request().url()).searchParams.get("party_size"));
    const exceedsFloorCapacity = requestedPartySize > 4;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        options: [
          {
            service_date: serviceDate,
            shift_slug: shift.slug,
            shift_name: shift.name,
            start_time: "17:00",
            table_id: 1,
            table_name: "1",
            table_capacity: 2,
            available: !exceedsFloorCapacity,
            unavailable_reason: exceedsFloorCapacity ? "Party exceeds table capacity" : "",
          },
          {
            service_date: serviceDate,
            shift_slug: shift.slug,
            shift_name: shift.name,
            start_time: "17:30",
            table_id: 2,
            table_name: "2",
            table_capacity: 2,
            available: !exceedsFloorCapacity,
            unavailable_reason: exceedsFloorCapacity ? "Party exceeds table capacity" : "",
          },
        ],
      }),
    });
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

test("booking restores time selection before optional table assignment", async ({ page }) => {
  await mockGrid(page);
  await mockAvailability(page);
  await page.goto(`/reservations/book?date=${serviceDate}&shift=dinner`);

  await page.getByRole("button", { name: "Party size" }).click();
  const manualPartySize = page.getByRole("spinbutton", { name: "Enter party size" });
  await expect(manualPartySize).toHaveValue("9");
  const quickSelectBounds = await page.locator(".party-size-picker").boundingBox();
  const manualBounds = await page.locator(".party-size-manual").boundingBox();
  expect(quickSelectBounds).not.toBeNull();
  expect(manualBounds).not.toBeNull();
  expect(manualBounds!.y).toBeGreaterThanOrEqual(quickSelectBounds!.y + quickSelectBounds!.height);
  await page.getByRole("button", { name: "4", exact: true }).click();
  await expect(manualPartySize).toHaveValue("9");
  await manualPartySize.click();
  await expect(manualPartySize).toHaveValue("");
  await expect(manualPartySize).toHaveAttribute("placeholder", "9");
  await manualPartySize.fill("12");
  await expect(page.locator(".wizard-progress-value").nth(1)).toHaveText("12 guests");
  await page.getByRole("button", { name: "4", exact: true }).click();
  await expect(manualPartySize).toHaveValue("12");
  await expect(page.getByRole("button", { name: "Assign Tables" })).toHaveCount(0);
  await page.locator("footer").getByRole("button", { name: "Time" }).click();

  await expect(page.getByRole("heading", { name: "Choose an available time" })).toBeVisible();
  const assignTables = page.getByRole("button", { name: "Assign Tables" });
  await expect(assignTables).toBeDisabled();

  const selectedTime = page.getByRole("button", { name: /^5:30 PM,/ });
  await selectedTime.click();
  await expect(selectedTime).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".time-and-tables-selection strong")).toHaveText("5:30 PM");
  await expect(assignTables).toBeEnabled();
  await expect(page.locator("footer").getByRole("button", { name: "Guest" })).toBeEnabled();

  await assignTables.click();
  await expect(page.getByRole("heading", { name: "Assign tables" })).toBeVisible();
  await page.getByRole("button", { name: /^Table 1, 2 seats/ }).click();
  await page.getByRole("button", { name: "Assign selected tables" }).click();
  await expect(page.getByRole("heading", { name: "Choose an available time" })).toBeVisible();
  await expect(page.locator(".time-and-tables-selection span")).toHaveText("1 table assigned");
});

test("oversized parties warn but can continue to time selection", async ({ page }) => {
  await mockGrid(page);
  await mockAvailability(page);
  await page.goto(`/reservations/book?date=${serviceDate}&shift=dinner`);

  await page.getByRole("button", { name: "Party size" }).click();
  await page.getByRole("spinbutton", { name: "Enter party size" }).fill("200");

  await expect(page.getByText("This party exceeds the floor capacity")).toBeVisible();
  await expect(page.getByText("200 guests requested · 4 covers available. You can continue and overbook.")).toBeVisible();
  const expectedTurnBounds = await page.locator(".turn-time-field").boundingBox();
  const warningBounds = await page.locator(".booking-capacity-warning").boundingBox();
  expect(expectedTurnBounds).not.toBeNull();
  expect(warningBounds).not.toBeNull();
  expect(warningBounds!.y).toBeGreaterThanOrEqual(expectedTurnBounds!.y + expectedTurnBounds!.height);
  await expect(page.locator(".wizard-progress li").nth(2)).toHaveClass(/capacity-warning/);
  await expect(page.locator(".wizard-progress li").nth(2)).toHaveCSS("color", "rgb(255, 131, 120)");

  const timeButton = page.locator("footer").getByRole("button", { name: "Time" });
  await expect(timeButton).toHaveClass(/capacity-warning/);
  await page.mouse.move(0, 0);
  await expect(timeButton).toHaveCSS("background-color", "rgb(159, 57, 47)");
  await expect(timeButton).toBeEnabled();
  await timeButton.click();

  await expect(page.getByText("Overbooking warning")).toBeVisible();
  await expect(page.getByText("Party exceeds table capacity").first()).toBeVisible();
  const unavailableTime = page.getByRole("button", { name: /^5:00 PM,/ });
  await expect(unavailableTime).toBeEnabled();
  await unavailableTime.click();
  await expect(unavailableTime).toHaveAttribute("aria-pressed", "true");
  await expect(unavailableTime).toHaveClass(/confirm-overbook/);
  await expect(unavailableTime).toHaveCSS("background-color", "rgba(164, 44, 35, 0.28)");
  await expect(page.locator("footer").getByRole("button", { name: "Guest" })).toBeEnabled();
});
