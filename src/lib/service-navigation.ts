export type ServiceShift = {
  slug: string;
  start_time: string;
};

export function localDateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function todayLocal() {
  return localDateValue(new Date());
}

export function moveServiceDate(value: string, amount: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return localDateValue(date);
}

export function validServiceDate(value: string | string[] | undefined) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) || localDateValue(parsed) !== value ? undefined : value;
}

export function validShiftSlug(value: string | string[] | undefined) {
  return typeof value === "string" && /^[a-z0-9][a-z0-9_-]*$/i.test(value) ? value : undefined;
}

export function closestServiceOccurrence(shifts: ServiceShift[], now = new Date()) {
  const candidates = shifts.flatMap((shift) => {
    const [hour, minute] = shift.start_time.split(":").map(Number);
    return [-1, 0, 1].map((dayOffset) => {
      const startsAt = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + dayOffset,
        hour,
        minute,
      );
      return {
        date: localDateValue(startsAt),
        shiftSlug: shift.slug,
        distance: Math.abs(startsAt.getTime() - now.getTime()),
      };
    });
  });

  return candidates.reduce<(typeof candidates)[number] | null>(
    (closest, candidate) => !closest || candidate.distance < closest.distance ? candidate : closest,
    null,
  );
}

export function writeServiceUrl(
  serviceDate: string,
  shiftSlug: string,
  mode: "push" | "replace" = "push",
) {
  const url = new URL(window.location.href);
  url.searchParams.set("date", serviceDate);
  url.searchParams.set("shift", shiftSlug);
  const nextUrl = `${url.pathname}?${url.searchParams.toString()}${url.hash}`;
  if (mode === "replace") window.history.replaceState(null, "", nextUrl);
  else window.history.pushState(null, "", nextUrl);
}

export function serviceStateFromSearch(search: string) {
  const params = new URLSearchParams(search);
  return {
    serviceDate: validServiceDate(params.get("date") || undefined),
    shiftSlug: validShiftSlug(params.get("shift") || undefined),
  };
}
