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

const unexpectedPageErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  unexpectedPageErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
});

test.afterEach(async ({ page }) => {
  await page.waitForTimeout(20);
  expect(unexpectedPageErrors.get(page) || []).toEqual([]);
});

async function mockGrid(page: Page, delayMs = 0) {
  await page.route("**/api/grid?*", async (route) => {
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(gridPayload) });
  });
}

test("new reservation confirmation is readable from the grid", async ({ page }) => {
  const reservation = {
    id: 101,
    table_id: 1,
    table_name: "1",
    table_ids: [1],
    table_names: ["1"],
    guest_name: "Alex Morgan",
    party_size: 2,
    start_time: "17:00",
    duration_minutes: 90,
    status: "confirmed",
    assignment_type: "soft",
    is_unassigned: false,
    guest_phone: "",
    guest_email: "alex@example.com",
    guest_notes: "",
    guest_profile_notes: "",
    guest_tags: [],
    tags: [],
    notes: "",
  };
  await page.route("**/api/grid?*", (route) => route.fulfill({
    json: {
      ...gridPayload,
      reservations: [reservation],
      summary: { reservations: 1, covers: 2, seated: 0 },
    },
  }));

  await page.goto(`/reservations?date=${serviceDate}&shift=dinner&confirmation=101`);

  const dialog = page.getByRole("dialog", { name: "Read this back to the guest" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(
    "Alex Morgan is confirmed for 2 guests on Friday, September 4 at 5:00 PM.",
  );
  await expect(dialog).toContainText("Dinner");
  await expect(dialog).toContainText("1:30");
  await expect(dialog).toContainText("Table 1");
  await expect(dialog.getByRole("button", { name: /Send confirmation email/ })).toBeDisabled();
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toBeHidden();
});

test("reservation grid date controls do not overlap shift buttons", async ({ page }) => {
  const shifts = [
    { ...shift, id: 1, name: "Breakfast", slug: "breakfast", start_time: "07:00", end_time: "11:00" },
    { ...shift, id: 2, name: "Lunch", slug: "lunch", start_time: "11:30", end_time: "16:00" },
    { ...shift, id: 3 },
  ];
  await page.route("**/api/grid?*", (route) => route.fulfill({
    json: { ...gridPayload, training_mode: true, shifts },
  }));

  for (const viewport of [{ width: 2048, height: 1130 }, { width: 1180, height: 800 }]) {
    await page.setViewportSize(viewport);
    await page.goto(`/reservations?date=${serviceDate}&shift=dinner`);
    const [shiftTabs, dateControl] = await Promise.all([
      page.locator(".shift-tabs").boundingBox(),
      page.getByLabel("Choose service date").boundingBox(),
    ]);
    expect(shiftTabs).not.toBeNull();
    expect(dateControl).not.toBeNull();
    const shiftsRight = shiftTabs!.x + shiftTabs!.width;
    const dateRight = dateControl!.x + dateControl!.width;
    const separated = shiftsRight <= dateControl!.x
      || dateRight <= shiftTabs!.x
      || shiftTabs!.y + shiftTabs!.height <= dateControl!.y
      || dateControl!.y + dateControl!.height <= shiftTabs!.y;
    expect(separated).toBe(true);
  }
});

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
    let lastUpdate: Record<string, unknown> | null = null;
    await page.route("**/api/grid?*", (route) => route.fulfill({
      json: { ...gridPayload, current_service_date: futureDate ? "2026-09-03" : serviceDate,
        reservations: [reservation], summary: { reservations: 1, covers: 2, seated: 0 } },
    }));
    await page.route("**/api/grid/reservations/101/moves", (route) => route.fulfill({ json: [] }));
    await page.route("**/api/grid/reservations/101", async (route) => {
      updates++;
      lastUpdate = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({ json: { ...reservation, ...lastUpdate } });
    });
    await page.goto(`/reservations?date=${serviceDate}&shift=dinner`);
    await page.getByRole("button", { name: /Future Guest, party of 2/ }).click();
    const seat = page.getByRole("button", { name: "Mark seated", exact: true });
    if (futureDate) {
      await expect(seat).toBeDisabled();
      await expect(page.getByRole("button", { name: "Complete", exact: true })).toHaveCount(0);
      await expect(page.getByText("Reservations cannot be seated or marked as served on future dates.")).toBeVisible();
      await expect(page.getByRole("button", { name: "Cancel reservation", exact: true })).toBeEnabled();
      expect(updates).toBe(0);
      await page.goto(`/floor?date=${serviceDate}&shift=dinner`);
      await expect(page.getByText("Viewing another service date. Return to today to seat parties or change table statuses.")).toBeVisible();
      await expect(page.getByRole("button", { name: "Seat", exact: true })).toBeDisabled();
      await expect(page.getByRole("button", { name: "Walk In", exact: true })).toBeDisabled();
      await expect(page.locator(".floor-reservation-move-indicator")).toHaveCount(0);
      await page.getByRole("button", { name: "Reassign Future Guest from Table 1" }).click();
      await expect(page.getByText("Select one or more available tables, then save the assignment.")).toBeVisible();
      await page.locator('[data-floor-table-id="1"]').click();
      await page.locator('[data-floor-table-id="2"]').click();
      await page.getByRole("button", { name: "Save Table Assignment", exact: true }).click();
      expect(updates).toBe(1);
      expect(lastUpdate).toEqual({ table_ids: [2] });
    } else {
      await expect(seat).toBeEnabled();
      await seat.click();
      await expect(seat).toHaveCount(0);
      expect(updates).toBe(1);
      await page.goto(`/floor?date=${serviceDate}&shift=dinner`);
      await expect(page.getByRole("button", { name: "Reassign Future Guest from Table 1" })).toBeVisible();
      await expect(page.locator(".floor-reservation-move-indicator")).toHaveCount(1);
    }
  });
}

test("large table assignments use a condensed reservation-card label", async ({ page }) => {
  const reservation = {
    id: 102, table_id: 1, table_name: "10", table_ids: [1],
    table_names: ["16", "12", "14", "10", "15", "11"],
    guest_name: "Large Assignment", party_size: 12, start_time: "17:00", duration_minutes: 90,
    status: "confirmed", assignment_type: "soft", guest_tags: ["Regular"], tags: ["VIP", "Birthday"],
    guest_profile_notes: "Prefers a quiet corner.", notes: "Window table if possible.",
  };
  await page.route("**/api/grid?*", (route) => route.fulfill({
    json: { ...gridPayload, reservations: [reservation], summary: { reservations: 1, covers: 12, seated: 0 } },
  }));
  let savedUpdate: Record<string, unknown> | null = null;
  await page.route("**/api/grid/reservations/102", async (route) => {
    savedUpdate = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ json: { ...reservation, ...savedUpdate } });
  });

  await page.goto(`/floor?date=${serviceDate}&shift=dinner`);
  const workspace = page.locator(".floor-service-layout");
  const workspaceStyle = await workspace.evaluate((element) => {
    const style = getComputedStyle(element);
    return { borderWidth: style.borderTopWidth, borderRadius: style.borderRadius, boxShadow: style.boxShadow };
  });
  expect(workspaceStyle).toEqual({ borderWidth: "0px", borderRadius: "0px", boxShadow: "none" });
  const [workspaceWidth, pageWidth] = await Promise.all([
    workspace.evaluate((element) => element.getBoundingClientRect().width),
    page.locator(".floor-page").evaluate((element) => element.getBoundingClientRect().width),
  ]);
  expect(Math.abs(workspaceWidth - pageWidth)).toBeLessThan(2);
  const assignment = page.getByRole("button", {
    name: "Reassign Large Assignment from Tables 16, 12, 14, 10, 15, 11",
  });
  await expect(assignment.locator("strong")).toHaveText("10+");

  const reservationButton = page.getByRole("button", {
    name: "5:00 PM, Large Assignment, party of 12, assigned to Tables 16, 12, 14, 10, 15, 11",
  });
  await reservationButton.click();
  const details = page.getByRole("complementary", { name: "Reservation details for Large Assignment" });
  await expect(details).toBeVisible();
  await reservationButton.click();
  await expect(page.locator(".floor-reservation-detail-card.is-closing")).toHaveCSS("animation-name", "floor-reservation-detail-slide-out");
  await expect(page.locator(".floor-reservation-detail-card")).toHaveCount(0);

  await reservationButton.click();
  await expect(details).toBeVisible();
  await page.getByRole("button", { name: "Seat", exact: true }).click();
  await expect(page.locator(".floor-reservation-detail-card.is-closing")).toBeVisible();
  await expect(page.locator(".floor-reservation-detail-card")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Finish Seating", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();

  await reservationButton.click();
  await expect(details).toBeVisible();
  await details.evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished));
  });
  const [detailBounds, closeBounds, headingBounds] = await Promise.all([
    details.boundingBox(),
    details.getByRole("button", { name: "Close reservation details" }).boundingBox(),
    details.getByRole("heading", { name: "Edit reservation" }).boundingBox(),
  ]);
  expect(detailBounds).not.toBeNull();
  expect(closeBounds).not.toBeNull();
  expect(headingBounds).not.toBeNull();
  expect(closeBounds!.x - detailBounds!.x).toBeLessThan(60);
  expect(closeBounds!.y - detailBounds!.y).toBeLessThan(60);
  expect(closeBounds!.x + closeBounds!.width).toBeLessThanOrEqual(headingBounds!.x);
  const floorPanel = page.getByRole("region", { name: "Restaurant floor plan" });
  const [detailsBox, floorBox] = await Promise.all([details.evaluate((element) => element.getBoundingClientRect().width), floorPanel.evaluate((element) => element.getBoundingClientRect().width)]);
  expect(Math.abs(detailsBox - floorBox)).toBeLessThan(2);
  await expect(details.getByLabel("Guest name")).toHaveValue("Large Assignment");
  await expect(details.getByLabel("Enter party size")).toHaveValue("12");
  await expect(details.getByRole("textbox", { name: "Time", exact: true })).toHaveValue("17:00");
  await expect(details.getByRole("textbox", { name: "Turn time", exact: true })).toHaveValue("1:30");
  const statusButton = details.getByRole("button", { name: "Status" });
  await expect(statusButton).toContainText("Confirmed");
  const [guestNameBounds, statusBounds] = await Promise.all([
    details.getByLabel("Guest name").boundingBox(),
    statusButton.boundingBox(),
  ]);
  expect(guestNameBounds).not.toBeNull();
  expect(statusBounds).not.toBeNull();
  expect(Math.abs(guestNameBounds!.y - statusBounds!.y)).toBeLessThan(2);
  expect(statusBounds!.height).toBe(guestNameBounds!.height);
  await statusButton.click();
  await expect(details.getByRole("option")).toHaveText([
    "Booked", "Confirmed", "Late", "Not Confirmed", "Cancelled", "No-show",
  ]);
  await expect(details.getByRole("option", { name: "Seated" })).toHaveCount(0);
  await details.getByRole("option", { name: "Late" }).click();
  await expect(details).toContainText("16 + 12 + 14 + 10 + 15 + 11");
  const birthdayTag = details.getByRole("group", { name: "Reservation tags" }).getByRole("button", { name: "Birthday" });
  const regularTag = details.getByRole("group", { name: "Guest tags" }).getByRole("button", { name: "Regular" });
  await expect(birthdayTag).toHaveAttribute("aria-pressed", "true");
  await expect(regularTag).toHaveAttribute("aria-pressed", "true");
  await expect(birthdayTag.locator('[data-tag-icon="Birthday"]')).toBeVisible();
  await expect(regularTag.locator('[data-tag-icon="Regular"]')).toBeVisible();
  await expect(details.getByLabel("Reservation notes")).toHaveValue("Window table if possible.");
  await expect(details.getByLabel("Guest notes")).toHaveValue("Prefers a quiet corner.");
  expect(await details.evaluate((element) => getComputedStyle(element).animationName)).toBe("floor-reservation-detail-slide-in");

  await details.getByLabel("Guest name").fill("Updated Assignment");
  await details.getByLabel("Enter party size").fill("10");
  await details.getByRole("textbox", { name: "Time", exact: true }).fill("18:15");
  await details.getByRole("button", { name: "Increase turn time" }).click();
  await details.getByRole("button", { name: "Increase turn time" }).click();
  const reservationTags = details.getByRole("group", { name: "Reservation tags" });
  await reservationTags.getByRole("button", { name: "Birthday" }).click();
  await reservationTags.getByRole("button", { name: "Anniversary" }).click();
  await details.getByRole("group", { name: "Guest tags" }).getByRole("button", { name: "VIP" }).click();
  await details.getByLabel("Reservation notes").fill("Updated reservation note.");
  await details.getByLabel("Guest notes").fill("Updated guest note.");
  await details.getByRole("button", { name: "Save changes" }).click();
  expect(savedUpdate).toEqual({
    guest_name: "Updated Assignment",
    party_size: 10,
    start_time: "18:15",
    duration_minutes: 120,
    notes: "Updated reservation note.",
    tags: ["VIP", "Anniversary"],
    guest_notes: "Updated guest note.",
    guest_tags: ["Regular", "VIP"],
    status: "late",
  });
  await details.getByRole("button", { name: "Close reservation details" }).click();
  await expect(details).toHaveCount(0);
});

test("seated reservations only offer touch-friendly service statuses", async ({ page }) => {
  const reservation = {
    id: 103, table_id: 1, table_name: "1", table_ids: [1], table_names: ["1"],
    guest_name: "Service Guest", party_size: 2, start_time: "17:00", duration_minutes: 90,
    status: "seated", assignment_type: "hard", guest_tags: [], tags: [], notes: "",
  };
  await page.route("**/api/grid?*", (route) => route.fulfill({
    json: { ...gridPayload, reservations: [reservation], summary: { reservations: 1, covers: 2, seated: 2 } },
  }));

  await page.goto(`/floor?date=${serviceDate}&shift=dinner`);
  await page.getByRole("button", { name: "Table 1, Service Guest, Seated" }).click();
  const statusButton = page.getByRole("complementary", { name: "Reservation details for Service Guest" }).getByRole("button", { name: "Status" });
  expect((await statusButton.boundingBox())!.height).toBe(44);
  await statusButton.click();
  const statusOptions = page.getByRole("complementary", { name: "Reservation details for Service Guest" }).getByRole("option");
  await expect(statusOptions).toHaveText([
    "Seated", "Entree", "Dessert", "Check dropped", "Paid", "Done",
  ]);
  await expect(page.getByRole("option", { name: "Confirmed" })).toHaveCount(0);
});

test("floor plan can toggle stacked reservation times for each table", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-04T17:45:00") });
  const reservations = [
    {
      id: 104, table_id: 1, table_name: "1", table_ids: [1], table_names: ["1"],
      guest_name: "Early party", party_size: 2, start_time: "17:00", duration_minutes: 90,
      status: "confirmed", assignment_type: "hard", guest_tags: [], tags: [], notes: "",
    },
    {
      id: 105, table_id: 1, table_name: "1", table_ids: [1], table_names: ["1"],
      guest_name: "Late party", party_size: 2, start_time: "19:30", duration_minutes: 90,
      status: "confirmed", assignment_type: "hard", guest_tags: [], tags: [], notes: "",
    },
    {
      id: 106, table_id: 2, table_name: "2", table_ids: [2], table_names: ["2"],
      guest_name: "Seated party", party_size: 2, start_time: "17:00", duration_minutes: 90,
      status: "seated", assignment_type: "hard", guest_tags: [], tags: [], notes: "",
    },
  ];
  await page.route("**/api/grid?*", (route) => route.fulfill({
    json: {
      ...gridPayload,
      sections: [{ id: 1, name: "Patio", color: "#d9aa62", table_ids: [1] }],
      reservations,
      summary: { reservations: 3, covers: 6, seated: 2 },
    },
  }));

  await page.goto(`/floor?date=${serviceDate}&shift=dinner`);
  const view = page.getByRole("button", { name: "View", exact: true });
  await expect(page.locator(".floor-section-overlays")).toBeVisible();
  await expect(page.locator('[data-floor-table-id="1"] .floor-table-reservation-times')).toHaveCount(0);

  await view.click();
  const reservationTimes = page.getByRole("checkbox", { name: "Reservation times" });
  const floorTimes = page.getByRole("checkbox", { name: "Floor times" });
  const sectionOutlines = page.getByRole("checkbox", { name: "Section outlines" });
  await expect(reservationTimes).not.toBeChecked();
  await expect(floorTimes).not.toBeChecked();
  await expect(sectionOutlines).toBeChecked();

  await reservationTimes.check();
  await expect(page.locator('[data-floor-table-id="1"] .floor-table-reservation-times time')).toHaveText(["5:00 PM", "7:30 PM"]);

  await floorTimes.check();
  const floorTimer = page.locator('[data-floor-table-id="2"] .floor-table-turn-timer');
  await expect(floorTimer).toHaveClass(/on-track/);
  await expect(floorTimer).toBeVisible();
  const turnDash = await floorTimer.locator("rect").getAttribute("stroke-dasharray");
  expect(turnDash).not.toBeNull();
  expect(Number(turnDash!.split(" ")[0])).toBeCloseTo(50, 1);

  await sectionOutlines.uncheck();
  await expect(page.locator(".floor-section-overlays")).toHaveCount(0);

  await reservationTimes.uncheck();
  await expect(page.locator('[data-floor-table-id="1"] .floor-table-reservation-times')).toHaveCount(0);

  await floorTimes.uncheck();
  await expect(floorTimer).toHaveCount(0);

  await page.locator(".floor-canvas").click({ position: { x: 8, y: 8 } });
  await expect(page.locator(".floor-view-menu")).not.toHaveAttribute("open", "");
  await expect(page.getByRole("checkbox", { name: "Reservation times" })).toHaveCount(0);
});

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
            start_time: "19:30",
            table_id: 2,
            table_name: "2",
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

test("grid date controls stay compact and centered", async ({ page }) => {
  await mockGrid(page);
  await page.goto(`/reservations?date=${serviceDate}&shift=dinner`);

  const [toolbarBounds, shiftBounds, dateBounds, nextBounds, nowBounds] = await Promise.all([
    page.locator(".grid-toolbar").boundingBox(),
    page.locator(".grid-toolbar .shift-tabs").boundingBox(),
    page.locator(".grid-toolbar > .date-control").boundingBox(),
    page.getByRole("button", { name: "Next day" }).boundingBox(),
    page.getByRole("button", { name: "Return to current day and shift" }).boundingBox(),
  ]);
  expect(toolbarBounds).not.toBeNull();
  expect(shiftBounds).not.toBeNull();
  expect(dateBounds).not.toBeNull();
  expect(nextBounds).not.toBeNull();
  expect(nowBounds).not.toBeNull();
  expect(Math.abs((dateBounds!.x + dateBounds!.width / 2) - (toolbarBounds!.x + toolbarBounds!.width / 2))).toBeLessThan(2);
  expect(dateBounds!.width).toBeLessThan(360);
  expect(Math.abs(nowBounds!.x - (nextBounds!.x + nextBounds!.width))).toBeLessThan(2);

  await page.goto(`/floor?date=${serviceDate}&shift=dinner`);
  const floorToolbar = page.locator('header[aria-label="Floor plan controls"]');
  await expect(page.getByRole("heading", { name: "Floor plan", exact: true })).toHaveCount(0);
  const [floorToolbarBounds, floorShiftBounds, floorDateBounds] = await Promise.all([
    floorToolbar.boundingBox(),
    floorToolbar.locator(".shift-tabs").boundingBox(),
    floorToolbar.locator(".date-control").boundingBox(),
  ]);
  expect(floorToolbarBounds).not.toBeNull();
  expect(floorShiftBounds).not.toBeNull();
  expect(floorDateBounds).not.toBeNull();
  expect(Math.abs(floorToolbarBounds!.x - toolbarBounds!.x)).toBeLessThan(2);
  expect(Math.abs(floorShiftBounds!.x - shiftBounds!.x)).toBeLessThan(2);
  expect(Math.abs((floorDateBounds!.x + floorDateBounds!.width / 2) - (dateBounds!.x + dateBounds!.width / 2))).toBeLessThan(2);
});

test("booking availability is centered around the guest's desired time", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockGrid(page);
  const requestedTimes: string[] = [];
  await page.route("**/api/grid/availability?*", async (route) => {
    const query = new URL(route.request().url()).searchParams;
    requestedTimes.push(query.get("desired_time") || "");
    const options = Array.from({ length: 20 }, (_, index) => {
      const minutes = 17 * 60 + index * 15;
      const startTime = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
      return {
        service_date: serviceDate,
        shift_slug: shift.slug,
        shift_name: shift.name,
        start_time: startTime,
        table_id: 1,
        table_name: "1",
        table_capacity: 4,
        available: true,
        unavailable_reason: "",
      };
    });
    await route.fulfill({ json: { options } });
  });

  await page.goto(`/reservations/book?date=${serviceDate}&shift=dinner`);
  await page.locator("footer").getByRole("button", { name: "Time & Party" }).click();

  const compactTimePartyLayout = await page.locator(".wizard-body").evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(compactTimePartyLayout.scrollHeight).toBeLessThanOrEqual(compactTimePartyLayout.clientHeight);

  const desiredTimes = page.getByLabel("Desired reservation times");
  const [timePartyBounds, partyBounds, desiredBounds] = await Promise.all([
    page.locator(".booking-time-party-step").boundingBox(),
    page.locator(".booking-party-panel").boundingBox(),
    page.locator(".time-choice-section").first().boundingBox(),
  ]);
  expect(timePartyBounds).not.toBeNull();
  expect(partyBounds).not.toBeNull();
  expect(desiredBounds).not.toBeNull();
  expect(partyBounds!.width).toBeGreaterThanOrEqual(timePartyBounds!.width - 1);
  expect(partyBounds!.y + partyBounds!.height).toBeLessThanOrEqual(desiredBounds!.y);
  expect(desiredBounds!.width).toBeGreaterThanOrEqual(timePartyBounds!.width - 1);
  await expect(desiredTimes.locator("button strong")).toHaveText([
    "7:00 PM", "7:15 PM", "7:30 PM", "7:45 PM", "8:00 PM",
  ]);
  const availableTimes = page.getByLabel("Available reservation times");
  await expect(availableTimes).toHaveCount(1);
  await expect(availableTimes.locator(".time-carousel-placeholder")).toHaveCount(5);
  await expect(page.getByText("No reservation times found")).toHaveCount(0);
  await desiredTimes.getByRole("button", { name: "7:30 PM", exact: true }).click();

  const desiredTimeBounds = await desiredTimes.boundingBox();
  expect(desiredTimeBounds).not.toBeNull();
  await page.mouse.move(desiredTimeBounds!.x + desiredTimeBounds!.width * 0.3, desiredTimeBounds!.y + desiredTimeBounds!.height / 2);
  await page.mouse.down();
  await page.mouse.move(desiredTimeBounds!.x + desiredTimeBounds!.width * 0.7, desiredTimeBounds!.y + desiredTimeBounds!.height / 2);
  await page.mouse.up();
  await page.waitForTimeout(50);
  await expect(desiredTimes.locator("button strong")).toHaveText([
    "6:45 PM", "7:00 PM", "7:15 PM", "7:30 PM", "7:45 PM",
  ]);
  await expect(desiredTimes.getByRole("button", { name: "7:30 PM", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "4", exact: true }).click();

  await expect.poll(() => requestedTimes.at(-1)).toBe("19:30");
  const availableResults = page.getByLabel("Available reservation times");
  await expect(availableResults.locator("button strong")).toHaveText([
    "7:00 PM", "7:15 PM", "7:30 PM", "7:45 PM", "8:00 PM",
  ]);
  const requestedAvailableTime = page.getByRole("button", { name: "7:30 PM, requested time, seats up to 4" });
  const alternateAvailableTime = page.getByRole("button", { name: "7:45 PM, seats up to 4" });
  await expect(requestedAvailableTime).toHaveAttribute("aria-pressed", "false");
  await alternateAvailableTime.click();
  await expect(alternateAvailableTime).toHaveAttribute("aria-pressed", "true");
  await expect(requestedAvailableTime).toHaveAttribute("aria-pressed", "false");
  await expect(availableResults.locator("button.selected")).toHaveCount(1);
  await expect(availableResults.locator('button[aria-pressed="true"]')).toHaveCount(1);
  const [requestedBackground, selectedBackground] = await Promise.all([
    requestedAvailableTime.evaluate((element) => getComputedStyle(element).backgroundColor),
    alternateAvailableTime.evaluate((element) => getComputedStyle(element).backgroundColor),
  ]);
  expect(requestedBackground).not.toBe(selectedBackground);
  await page.getByRole("button", { name: "Show later available times" }).click();
  await expect(page.locator(".time-carousel-track.time-carousel-slide-later")).toBeVisible();
  await expect(availableResults.locator("button strong")).toHaveText([
    "7:15 PM", "7:30 PM", "7:45 PM", "8:00 PM", "8:15 PM",
  ]);
});

test("reservation navigation is not overwritten by a late grid response", async ({ page }) => {
  await mockGrid(page, 600);
  await page.goto(`/reservations?date=${serviceDate}&shift=dinner`);

  await page.getByRole("link", { name: "Book a reservation" }).click();
  await expect(page).toHaveURL(new RegExp(`/reservations/book\\?date=${serviceDate}&shift=dinner$`));
  await expect(page.getByRole("heading", { name: "Find the right table" })).toBeVisible();

  await page.getByRole("link", { name: "Reservations" }).click();
  await expect(page).toHaveURL(new RegExp(`/reservations\\?date=${serviceDate}&shift=dinner$`));
});

test("late default-shift responses cannot loop between breakfast and dinner", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-04T20:00:00") });
  const breakfast = { ...shift, id: 2, name: "Breakfast", slug: "breakfast", start_time: "07:00", end_time: "11:00" };
  const requests: string[] = [];
  await page.route("**/api/grid?*", async (route) => {
    const requestedShift = new URL(route.request().url()).searchParams.get("shift") || "default";
    requests.push(requestedShift);
    await new Promise((resolve) => setTimeout(resolve, requestedShift === "default" ? 250 : 40));
    await route.fulfill({ json: {
      ...gridPayload, shifts: [breakfast, shift],
      selected_shift: requestedShift === "dinner" ? shift : breakfast,
    } });
  });
  await page.goto("/reservations");
  await expect(page).toHaveURL(/shift=dinner/);
  await expect(page.getByRole("button", { name: "Book table 1 at 5:00 PM", exact: true })).toBeVisible();
  // Let delayed default responses finish and verify that they cannot restart fetching.
  await new Promise((resolve) => setTimeout(resolve, 1200));
  await expect(page).toHaveURL(/shift=dinner/);
  expect(requests).not.toContain("breakfast");
  expect(requests.length).toBeLessThanOrEqual(4);
});

test("floor changes can be undone and redone", async ({ page }) => {
  await mockGrid(page);
  await page.goto(`/floor?date=${serviceDate}&shift=dinner`);
  await page.getByRole("button", { name: "Edit Floor" }).click();

  await expect(page.getByRole("heading", { name: "Floor plan" })).toHaveCount(0);
  await expect(page.getByLabel("Shift")).toHaveCount(0);
  await expect(page.getByLabel("Choose service date")).toHaveCount(0);
  await expect(page.getByText("Dining room", { exact: true })).toHaveCount(0);
  const [pageBounds, workspaceBounds, pageStyle, panelStyle] = await Promise.all([
    page.locator(".floor-page").boundingBox(),
    page.locator(".floor-service-layout").boundingBox(),
    page.locator(".floor-page").evaluate((element) => getComputedStyle(element).padding),
    page.locator(".floor-plan-panel").evaluate((element) => getComputedStyle(element).padding),
  ]);
  expect(pageBounds).not.toBeNull();
  expect(workspaceBounds).not.toBeNull();
  expect(Math.abs(pageBounds!.width - workspaceBounds!.width)).toBeLessThan(2);
  expect(pageStyle).toBe("0px");
  expect(panelStyle).toBe("0px");

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

test("selected floor tables can be aligned and spaced vertically", async ({ page }) => {
  const tables = [
    { ...gridPayload.tables[0], id: 1, name: "1", position_x: 28, position_y: 24 },
    { ...gridPayload.tables[0], id: 2, name: "2", position_x: 32, position_y: 46 },
    { ...gridPayload.tables[0], id: 3, name: "3", position_x: 25, position_y: 76 },
  ];
  await page.route("**/api/grid?*", (route) => route.fulfill({
    json: { ...gridPayload, tables },
  }));
  await page.goto(`/floor?date=${serviceDate}&shift=dinner`);
  await page.getByRole("button", { name: "Edit Floor" }).click();

  for (const [index, table] of tables.entries()) {
    await page.locator(`[data-floor-table-id="${table.id}"]`).click({
      modifiers: index ? ["Shift"] : [],
    });
  }
  await expect(page.getByText("3 tables selected")).toBeVisible();

  await page.getByRole("button", { name: "Align column" }).click();
  const alignedCenters = await Promise.all(tables.map(async (table) => {
    const bounds = await page.locator(`[data-floor-table-id="${table.id}"]`).boundingBox();
    expect(bounds).not.toBeNull();
    return bounds!.x + bounds!.width / 2;
  }));
  expect(Math.max(...alignedCenters) - Math.min(...alignedCenters)).toBeLessThan(2.5);

  await page.getByRole("button", { name: "Equal vertical" }).click();
  const spacedCenters = await Promise.all(tables.map(async (table) => {
    const bounds = await page.locator(`[data-floor-table-id="${table.id}"]`).boundingBox();
    expect(bounds).not.toBeNull();
    return bounds!.y + bounds!.height / 2;
  }));
  expect(Math.abs(
    (spacedCenters[1] - spacedCenters[0]) - (spacedCenters[2] - spacedCenters[1]),
  )).toBeLessThan(2.5);
  await expect(page.getByRole("button", { name: "Undo last floor change" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Save Floor" })).toBeEnabled();
});

test("cloning lettered tables preserves the prefix and advances its number", async ({ page }) => {
  const numericTables = Array.from({ length: 6 }, (_, index) => ({
    ...gridPayload.tables[0],
    id: index + 1,
    name: String(index + 1),
    sort_order: index + 1,
    position_x: 12 + index * 10,
    position_y: 24,
  }));
  const letteredTables = [
    { ...gridPayload.tables[0], id: 7, name: "B1", sort_order: 7, position_x: 30, position_y: 52 },
    { ...gridPayload.tables[0], id: 8, name: "B2", sort_order: 8, position_x: 30, position_y: 68 },
  ];
  await page.route("**/api/grid?*", (route) => route.fulfill({
    json: { ...gridPayload, tables: [...numericTables, ...letteredTables] },
  }));
  await page.goto(`/floor?date=${serviceDate}&shift=dinner`);
  await page.getByRole("button", { name: "Edit Floor" }).click();

  await page.locator('[data-floor-table-id="7"]').click();
  await page.locator('[data-floor-table-id="8"]').click({ modifiers: ["Shift"] });
  await page.getByRole("button", { name: "Clone Table" }).click();

  await expect(page.getByRole("button", { name: /^Table B3,/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Table B4,/ })).toBeVisible();
  await expect(page.getByText("2 tables selected")).toBeVisible();
  await expect(page.locator(".floor-table.duplicate-number")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save Floor" })).toBeEnabled();
});

test("floor tables can cross each other but overlapping drops block saving", async ({ page }) => {
  await page.route("**/api/grid?*", (route) => route.fulfill({
    json: {
      ...gridPayload,
      tables: [
        { ...gridPayload.tables[0], position_x: 18, position_y: 45 },
        { ...gridPayload.tables[1], position_x: 50, position_y: 45 },
      ],
    },
  }));
  await page.goto(`/floor?date=${serviceDate}&shift=dinner`);
  await page.getByRole("button", { name: "Edit Floor" }).click();

  const first = page.locator('[data-floor-table-id="1"]');
  const second = page.locator('[data-floor-table-id="2"]');
  const stage = page.locator(".floor-canvas-stage");
  const [firstStart, secondBounds, stageBounds] = await Promise.all([
    first.boundingBox(), second.boundingBox(), stage.boundingBox(),
  ]);
  expect(firstStart).not.toBeNull();
  expect(secondBounds).not.toBeNull();
  expect(stageBounds).not.toBeNull();

  await page.mouse.move(firstStart!.x + firstStart!.width / 2, firstStart!.y + firstStart!.height / 2);
  await page.mouse.down();
  const beyondSecondX = Math.min(
    stageBounds!.x + stageBounds!.width - firstStart!.width / 2 - 8,
    secondBounds!.x + secondBounds!.width + firstStart!.width / 2 + 36,
  );
  await page.mouse.move(beyondSecondX, secondBounds!.y + secondBounds!.height / 2, { steps: 20 });
  await page.mouse.up();
  const crossedBounds = await first.boundingBox();
  expect(crossedBounds).not.toBeNull();
  expect(crossedBounds!.x).toBeGreaterThan(secondBounds!.x + secondBounds!.width);
  await expect(page.locator(".floor-table.overlapping-table")).toHaveCount(0);

  await page.mouse.move(crossedBounds!.x + crossedBounds!.width / 2, crossedBounds!.y + crossedBounds!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    secondBounds!.x + secondBounds!.width / 2,
    secondBounds!.y + secondBounds!.height / 2,
    { steps: 10 },
  );
  await page.mouse.up();

  await expect(first).toHaveClass(/overlapping-table/);
  await expect(second).toHaveClass(/overlapping-table/);
  await expect(first.locator(".floor-table-surface")).toHaveCSS("border-color", "rgb(255, 128, 89)");
  await expect(second.locator(".floor-table-surface")).toHaveCSS("border-color", "rgb(255, 128, 89)");
  await expect(page.getByText("Overlapping tables must be moved apart before saving.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save Floor" })).toBeDisabled();
});

test("auto polish aligns and evenly spaces floor rows and columns", async ({ page }) => {
  const coordinates = [
    [24.5, 24], [35.5, 25.5], [45, 24.5],
    [25.5, 50.5], [34.5, 49], [46, 51],
    [24, 75.5], [35, 74], [45.5, 76],
  ];
  const tables = coordinates.map(([position_x, position_y], index) => ({
    ...gridPayload.tables[index % gridPayload.tables.length],
    id: index + 1,
    name: String(index + 1),
    width: 72,
    height: 64,
    position_x,
    position_y,
  }));
  await page.route("**/api/grid?*", (route) => route.fulfill({
    json: { ...gridPayload, tables },
  }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/floor?date=${serviceDate}&shift=dinner`);
  await page.getByRole("button", { name: "Edit Floor" }).click();
  await page.getByRole("button", { name: "Auto polish" }).click();

  const centers = await Promise.all(tables.map(async (table) => {
    const bounds = await page.locator(`[data-floor-table-id="${table.id}"]`).boundingBox();
    expect(bounds).not.toBeNull();
    return { x: bounds!.x + bounds!.width / 2, y: bounds!.y + bounds!.height / 2 };
  }));
  for (const row of [[0, 1, 2], [3, 4, 5], [6, 7, 8]]) {
    expect(Math.max(...row.map((index) => centers[index].y)) - Math.min(...row.map((index) => centers[index].y))).toBeLessThan(2.5);
  }
  for (const column of [[0, 3, 6], [1, 4, 7], [2, 5, 8]]) {
    expect(Math.max(...column.map((index) => centers[index].x)) - Math.min(...column.map((index) => centers[index].x))).toBeLessThan(2.5);
  }
  expect(Math.abs((centers[1].x - centers[0].x) - (centers[2].x - centers[1].x))).toBeLessThan(2.5);
  expect(Math.abs((centers[3].y - centers[0].y) - (centers[6].y - centers[3].y))).toBeLessThan(2.5);
  await expect(page.getByRole("button", { name: "Undo last floor change" })).toBeEnabled();
  await expect(page.locator(".floor-table.overlapping-table")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save Floor" })).toBeEnabled();
});

test("auto polish keeps small bar stools separate beside larger tables", async ({ page }) => {
  const tables = [
    ...Array.from({ length: 12 }, (_, index) => ({
      ...gridPayload.tables[0], id: index + 1, name: String(index + 1),
      position_x: 12 + (index % 4) * 17, position_y: 20 + Math.floor(index / 4) * 28,
    })),
    ...Array.from({ length: 8 }, (_, index) => ({
      ...gridPayload.tables[0], id: index + 20, name: `B${index + 1}`,
      capacity: 1, shape: "round", width: 36, height: 36, rotation: 270,
      position_x: 86, position_y: 15 + index * 9,
    })),
  ];
  await page.route("**/api/grid?*", (route) => route.fulfill({ json: { ...gridPayload, tables } }));
  await page.goto(`/floor?date=${serviceDate}&shift=dinner`);
  await page.getByRole("button", { name: "Edit Floor" }).click();
  await expect(page.locator(".floor-table.overlapping-table")).toHaveCount(0);
  await page.getByRole("button", { name: "Auto polish" }).click();
  await expect(page.getByRole("button", { name: "Undo last floor change" })).toBeEnabled();
  await expect(page.locator(".floor-table.overlapping-table")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save Floor" })).toBeEnabled();
  const stools = await page.locator('[data-floor-table-id]').evaluateAll((elements) =>
    elements.filter((element) => Number(element.getAttribute("data-floor-table-id")) >= 20)
      .map((element) => element.getBoundingClientRect().y));
  expect(new Set(stools).size).toBe(8);
});

test("booking restores time selection before optional table assignment", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await mockGrid(page);
  await mockAvailability(page);
  await page.route("**/api/guests?q=*", (route) => route.fulfill({
    json: {
      results: [{
        id: 1,
        first_name: "Alyssa",
        last_name: "Garcia",
        full_name: "Alyssa Garcia",
        phone_number: "",
        email: "",
        company: "",
        guest_notes: "Enjoys special occasions.",
        tags: [],
      }],
    },
  }));
  await page.goto(`/reservations/book?date=${serviceDate}&shift=dinner`);
  const wizardHeight = await page.locator(".booking-wizard").evaluate((element) => Math.round(element.getBoundingClientRect().height));

  await page.locator("footer").getByRole("button", { name: "Time & Party" }).click();
  expect(await page.locator(".booking-wizard").evaluate((element) => Math.round(element.getBoundingClientRect().height))).toBe(wizardHeight);
  await page.getByLabel("Desired reservation times").getByRole("button", { name: "7:30 PM" }).click();
  const manualPartySize = page.getByRole("spinbutton", { name: "Enter party size" });
  await expect(manualPartySize).toHaveValue("9");
  const quickSelectBounds = await page.locator(".party-size-picker").boundingBox();
  const manualBounds = await page.locator(".party-size-manual").boundingBox();
  const quickButtonBounds = await page.getByRole("button", { name: "1", exact: true }).boundingBox();
  const decreaseButtonBounds = await page.getByRole("button", { name: "Decrease party size" }).boundingBox();
  expect(quickSelectBounds).not.toBeNull();
  expect(manualBounds).not.toBeNull();
  expect(quickButtonBounds).not.toBeNull();
  expect(decreaseButtonBounds).not.toBeNull();
  expect(Math.abs(manualBounds!.y - quickSelectBounds!.y)).toBeLessThan(2);
  expect(Math.abs(decreaseButtonBounds!.y - quickButtonBounds!.y)).toBeLessThan(2);
  expect(Math.abs(decreaseButtonBounds!.height - quickButtonBounds!.height)).toBeLessThan(2);
  await page.getByRole("button", { name: "4", exact: true }).click();
  await expect(manualPartySize).toHaveValue("9");
  await manualPartySize.click();
  await expect(manualPartySize).toHaveValue("");
  await expect(manualPartySize).toHaveAttribute("placeholder", "9");
  await manualPartySize.fill("12");
  await expect(page.locator(".wizard-progress-value").nth(1)).toHaveText("7:30 PM · 12 guests");
  await page.getByRole("button", { name: "4", exact: true }).click();
  await expect(manualPartySize).toHaveValue("12");

  const assignTables = page.getByRole("button", { name: "Assign Tables" });
  await expect(assignTables).toBeDisabled();

  const selectedTime = page.getByLabel("Available reservation times").getByRole("button", { name: /^7:30 PM,/ });
  await selectedTime.click();
  await expect(selectedTime).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".time-and-tables-selection strong")).toHaveText("7:30 PM");
  await expect(assignTables).toBeEnabled();
  await expect(page.locator("footer").getByRole("button", { name: "Guest" })).toBeEnabled();

  await assignTables.click();
  await expect(page.getByRole("heading", { name: "Assign tables" })).toBeVisible();
  await page.getByRole("button", { name: /^Table 1, 2 seats/ }).click();
  await page.getByRole("button", { name: /^Table 2, 2 seats/ }).click();
  await page.getByRole("button", { name: "Assign selected tables" }).click();
  await expect(page.getByRole("heading", { name: "Party size" })).toBeVisible();
  await expect(page.locator(".time-and-tables-selection span")).toHaveText("Tables 1, 2");
  await expect(page.locator(".wizard-progress-value").nth(1)).toHaveText("7:30 PM · 4 guests · Tables 1, 2");

  await page.locator("footer").getByRole("button", { name: "Guest" }).click();
  expect(await page.locator(".booking-wizard").evaluate((element) => Math.round(element.getBoundingClientRect().height))).toBe(wizardHeight);
  await page.getByRole("searchbox", { name: "Guest search" }).fill("Alyssa");
  await page.getByRole("button", { name: /Alyssa Garcia/ }).click();
  await page.locator("footer").getByRole("button", { name: "Details" }).click();
  await expect(page.getByRole("heading", { name: "Reservation details" })).toBeVisible();
  expect(await page.locator(".booking-wizard").evaluate((element) => Math.round(element.getBoundingClientRect().height))).toBe(wizardHeight);
  await page.setViewportSize({ width: 1280, height: 900 });
  const [reservationNotes, guestNotes, reservationSection, guestSection] = await Promise.all([
    page.getByLabel("Reservation notes").boundingBox(),
    page.getByLabel("Guest notes").boundingBox(),
    page.locator(".reservation-detail-section").boundingBox(),
    page.locator(".guest-detail-section").boundingBox(),
  ]);
  expect(reservationNotes).not.toBeNull();
  expect(guestNotes).not.toBeNull();
  expect(reservationSection).not.toBeNull();
  expect(guestSection).not.toBeNull();
  expect(Math.abs(reservationNotes!.y - guestNotes!.y)).toBeLessThan(2);
  expect(Math.abs(reservationNotes!.height - guestNotes!.height)).toBeLessThan(2);
  expect(reservationNotes!.height).toBeGreaterThan(120);
  expect(Math.abs((reservationNotes!.y + reservationNotes!.height) - (reservationSection!.y + reservationSection!.height - 14))).toBeLessThan(2);
  expect(Math.abs((guestNotes!.y + guestNotes!.height) - (guestSection!.y + guestSection!.height - 14))).toBeLessThan(2);
});

test("table assignment stacks every active reservation time on its table", async ({ page }) => {
  await mockAvailability(page);
  const reservations = [
    {
      id: 201, table_id: 1, table_ids: [1], guest_name: "First seating", party_size: 2,
      start_time: "17:00", duration_minutes: 90, status: "confirmed", assignment_type: "hard",
    },
    {
      id: 202, table_id: 1, table_ids: [1], guest_name: "Second seating", party_size: 2,
      start_time: "19:30", duration_minutes: 90, status: "confirmed", assignment_type: "hard",
    },
    {
      id: 203, table_id: 1, table_ids: [1], guest_name: "Cancelled seating", party_size: 2,
      start_time: "20:30", duration_minutes: 90, status: "cancelled", assignment_type: "hard",
    },
  ];
  await page.route("**/api/grid?*", (route) => route.fulfill({
    json: { ...gridPayload, reservations, summary: { reservations: 3, covers: 6, seated: 0 } },
  }));

  await page.goto(`/reservations/book?date=${serviceDate}&shift=dinner`);
  await page.locator("footer").getByRole("button", { name: "Time & Party" }).click();
  await page.getByLabel("Desired reservation times").getByRole("button", { name: "7:30 PM" }).click();
  await page.getByLabel("Available reservation times").getByRole("button", { name: /^7:30 PM,/ }).click();
  await page.getByRole("button", { name: "Assign Tables" }).click();

  const table = page.getByRole("button", { name: /Table 1, 2 seats, reservations at 5PM, 7:30PM/ });
  await expect(table.locator(".reservation-turn-times em")).toHaveText(["5PM", "7:30PM"]);
  await expect(table.locator(".reservation-turn-times")).toHaveCSS("display", "grid");
  await expect(table).not.toContainText("8:30PM");
});

test("oversized parties warn but can continue to time selection", async ({ page }) => {
  await mockGrid(page);
  await mockAvailability(page);
  await page.goto(`/reservations/book?date=${serviceDate}&shift=dinner`);

  await page.locator("footer").getByRole("button", { name: "Time & Party" }).click();
  await page.getByLabel("Desired reservation times").getByRole("button", { name: "7:30 PM" }).click();
  await page.getByRole("spinbutton", { name: "Enter party size" }).fill("200");

  await expect(page.getByText("This party exceeds the floor capacity")).toBeVisible();
  await expect(page.getByText("200 guests requested · 4 covers available. You can continue and overbook.")).toBeVisible();
  const partyBounds = await page.locator(".booking-party-panel").boundingBox();
  const warningBounds = await page.locator(".booking-capacity-warning").boundingBox();
  expect(partyBounds).not.toBeNull();
  expect(warningBounds).not.toBeNull();
  expect(warningBounds!.y + warningBounds!.height).toBeLessThanOrEqual(partyBounds!.y + partyBounds!.height);
  await expect(page.locator(".wizard-progress li").nth(1)).toHaveClass(/capacity-warning/);
  await expect(page.locator(".wizard-progress li").nth(1)).toHaveCSS("color", "rgb(255, 131, 120)");

  const unavailableTime = page.getByLabel("Available reservation times").getByRole("button", { name: /^7:30 PM,/ });
  await expect(unavailableTime).toBeEnabled();
  await unavailableTime.click();
  await expect(unavailableTime).toHaveAttribute("aria-pressed", "true");
  await expect(unavailableTime).toHaveClass(/confirm-overbook/);
  await expect(unavailableTime).toHaveCSS("background-color", "rgba(164, 44, 35, 0.28)");
  await expect(page.locator("footer").getByRole("button", { name: "Guest" })).toBeEnabled();
});
