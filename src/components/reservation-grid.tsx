"use client";

import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CalendarX2,
  Clock3,
  LoaderCircle,
  Lock,
  Plus,
  Unlock,
  Users,
  X,
} from "lucide-react";
import { DragEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ServiceDatePicker } from "@/components/service-date-picker";
import { appPath } from "@/lib/app-paths";
import { IGNORE_AUTOFILL } from "@/lib/autofill";
import {
  closestServiceOccurrence,
  moveServiceDate,
  serviceStateFromSearch,
  todayLocal,
  writeServiceUrl,
} from "@/lib/service-navigation";

type Shift = {
  id: number;
  name: string;
  slug: string;
  start_time: string;
  end_time: string;
  default_turn_minutes: number;
};

type DiningTable = {
  id: number;
  name: string;
  capacity: number;
  sort_order: number;
  shape: "rectangle" | "round";
  position_x: number;
  position_y: number;
};

type Reservation = {
  id: number;
  table_id: number;
  table_name: string;
  table_ids: number[];
  table_names: string[];
  guest_name: string;
  party_size: number;
  start_time: string;
  duration_minutes: number;
  status:
    | "confirmed"
    | "seated"
    | "entree"
    | "dessert"
    | "check_dropped"
    | "paid"
    | "complete"
    | "cancelled";
  assignment_type: "soft" | "hard";
  guest_phone: string;
  guest_email: string;
  guest_notes: string;
  guest_profile_notes: string;
  guest_tags: string[];
  tags: string[];
  notes: string;
};

type TableMove = {
  id: number;
  from_table_name: string;
  to_table_name: string;
  move_type: "manual" | "reflow";
  reason: string;
  triggered_by_id: number | null;
  triggered_by_guest_name: string | null;
  created_at: string;
};

type GridData = {
  restaurant: { id: number; name: string };
  service_date: string;
  current_service_date: string;
  booking_allowed: boolean;
  shifts: Shift[];
  selected_shift: Shift;
  tables: DiningTable[];
  reservations: Reservation[];
  summary: { reservations: number; covers: number; seated: number };
};

type BookingDraft = {
  tableId: number;
  tableName: string;
  capacity: number;
  time: string;
};

const SLOT_MINUTES = 15;
const SLOT_WIDTH = 74;
const TABLE_COLUMNS_WIDTH = 140;

function minutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function timeFromMinutes(total: number) {
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function displayTime(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  const suffix = hour >= 12 ? "PM" : "AM";
  const clockHour = hour % 12 || 12;
  return `${clockHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function reservationsOverlap(left: Reservation, right: Reservation) {
  const leftStart = minutes(left.start_time);
  const rightStart = minutes(right.start_time);
  return (
    leftStart < rightStart + right.duration_minutes &&
    leftStart + left.duration_minutes > rightStart
  );
}

function readError(payload: unknown) {
  if (!payload || typeof payload !== "object") return "Something went wrong.";
  const entries = Object.values(payload as Record<string, unknown>);
  const first = entries[0];
  if (Array.isArray(first)) return String(first[0]);
  return typeof first === "string" ? first : "Something went wrong.";
}

type ReservationGridProps = {
  initialServiceDate?: string;
  initialShiftSlug?: string;
};

export function ReservationGrid({
  initialServiceDate,
  initialShiftSlug,
}: ReservationGridProps) {
  const [serviceDate, setServiceDate] = useState(initialServiceDate || todayLocal);
  const [shiftSlug, setShiftSlug] = useState(initialServiceDate ? initialShiftSlug || "" : "");
  const [data, setData] = useState<GridData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<BookingDraft | null>(null);
  const [selected, setSelected] = useState<Reservation | null>(null);
  const [saving, setSaving] = useState(false);
  const [draggedReservationId, setDraggedReservationId] = useState<number | null>(null);
  const [dropTargetTableId, setDropTargetTableId] = useState<number | null>(null);
  const [tableMoves, setTableMoves] = useState<TableMove[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [moveHistoryOpen, setMoveHistoryOpen] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const resolveCurrentService = useRef(!initialServiceDate);

  const loadGrid = useCallback(async () => {
    setLoading(true);
    setError("");
    const query = new URLSearchParams({ date: serviceDate });
    if (shiftSlug) query.set("shift", shiftSlug);
    try {
      const response = await fetch(`${appPath("/api/grid")}?${query}`, { cache: "no-store" });
      const payload = (await response.json()) as GridData | Record<string, unknown>;
      if (!response.ok) throw new Error(readError(payload));
      const next = payload as GridData;
      if (resolveCurrentService.current) {
        resolveCurrentService.current = false;
        const closest = closestServiceOccurrence(next.shifts);
        const currentDate = next.current_service_date || closest?.date || todayLocal();
        const currentShift = closest?.shiftSlug || next.selected_shift.slug;
        writeServiceUrl(currentDate, currentShift, "replace");
        if (currentDate !== serviceDate || currentShift !== next.selected_shift.slug) {
          setServiceDate(currentDate);
          setShiftSlug(currentShift);
          return;
        }
      }
      setData(next);
      setShiftSlug(next.selected_shift.slug);
      writeServiceUrl(serviceDate, next.selected_shift.slug, "replace");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load the reservation grid.");
    } finally {
      setLoading(false);
    }
  }, [serviceDate, shiftSlug]);

  useEffect(() => {
    // The grid is intentionally refreshed whenever the active service date or shift changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadGrid();
  }, [loadGrid]);

  useEffect(() => {
    function restoreServiceFromUrl() {
      const next = serviceStateFromSearch(window.location.search);
      if (next.serviceDate) {
        resolveCurrentService.current = false;
        setServiceDate(next.serviceDate);
        setShiftSlug(next.shiftSlug || "");
      } else {
        resolveCurrentService.current = true;
        setServiceDate(todayLocal());
        setShiftSlug("");
      }
    }

    window.addEventListener("popstate", restoreServiceFromUrl);
    return () => window.removeEventListener("popstate", restoreServiceFromUrl);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const slots = useMemo(() => {
    if (!data) return [];
    const start = minutes(data.selected_shift.start_time);
    const end = minutes(data.selected_shift.end_time);
    return Array.from({ length: (end - start) / SLOT_MINUTES }, (_, index) =>
      timeFromMinutes(start + index * SLOT_MINUTES),
    );
  }, [data]);

  const currentTimeMarker = useMemo(() => {
    if (!data || data.service_date !== data.current_service_date) return null;
    const shiftStart = minutes(data.selected_shift.start_time);
    const shiftEnd = minutes(data.selected_shift.end_time);
    const currentMinutes =
      currentTime.getHours() * 60 +
      currentTime.getMinutes() +
      currentTime.getSeconds() / 60;
    if (currentMinutes < shiftStart || currentMinutes >= shiftEnd) return null;
    return {
      label: displayTime(timeFromMinutes(Math.floor(currentMinutes))),
      left:
        TABLE_COLUMNS_WIDTH +
        ((currentMinutes - shiftStart) / SLOT_MINUTES) * SLOT_WIDTH,
    };
  }, [currentTime, data]);

  useEffect(() => {
    const scroller = timelineScrollRef.current;
    if (!scroller || !data || data.service_date !== data.current_service_date) return;
    const shiftStart = minutes(data.selected_shift.start_time);
    const shiftEnd = minutes(data.selected_shift.end_time);
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
    if (currentMinutes < shiftStart || currentMinutes >= shiftEnd) return;
    const markerLeft =
      TABLE_COLUMNS_WIDTH +
      ((currentMinutes - shiftStart) / SLOT_MINUTES) * SLOT_WIDTH;
    const frame = window.requestAnimationFrame(() => {
      const trackViewportWidth = Math.max(0, scroller.clientWidth - TABLE_COLUMNS_WIDTH);
      scroller.scrollLeft = Math.max(
        0,
        markerLeft - TABLE_COLUMNS_WIDTH - trackViewportWidth * 0.72,
      );
    });
    return () => window.cancelAnimationFrame(frame);
  }, [data]);

  const draggedReservation = useMemo(
    () => data?.reservations.find((item) => item.id === draggedReservationId) || null,
    [data, draggedReservationId],
  );
  const bookingAllowed = data?.service_date === serviceDate && typeof data.booking_allowed === "boolean"
    ? data.booking_allowed
    : serviceDate >= (data?.current_service_date || todayLocal());

  function chooseDate(next: string) {
    setDraft(null);
    setSelected(null);
    writeServiceUrl(next, shiftSlug || data?.selected_shift.slug || "dinner");
    setServiceDate(next);
  }

  function chooseShift(next: string) {
    setDraft(null);
    setSelected(null);
    writeServiceUrl(serviceDate, next);
    setShiftSlug(next);
  }

  function returnToNow() {
    setDraft(null);
    setSelected(null);
    const closest = closestServiceOccurrence(data?.shifts || []);
    const currentDate = data?.current_service_date || closest?.date || todayLocal();
    const currentShift = closest?.shiftSlug || data?.selected_shift.slug || shiftSlug || "dinner";
    writeServiceUrl(currentDate, currentShift);
    setServiceDate(currentDate);
    setShiftSlug(currentShift);
  }

  async function createReservation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || !data || !bookingAllowed) return;
    setSaving(true);
    setError("");
    const values = new FormData(event.currentTarget);
    const payload = {
      service_date: serviceDate,
      shift_slug: data.selected_shift.slug,
      table_id: draft.tableId,
      guest_name: values.get("guest_name"),
      party_size: Number(values.get("party_size")),
      start_time: draft.time,
      duration_minutes: Number(values.get("duration_minutes")),
      notes: values.get("notes"),
    };
    try {
      const response = await fetch(appPath("/api/grid"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const responsePayload = (await response.json()) as Record<string, unknown>;
      if (!response.ok) throw new Error(readError(responsePayload));
      setDraft(null);
      await loadGrid();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save the reservation.");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(status: Reservation["status"]) {
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(appPath(`/api/grid/reservations/${selected.id}`), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const payload = (await response.json()) as Reservation | Record<string, unknown>;
      if (!response.ok) throw new Error(readError(payload));
      setSelected(payload as Reservation);
      await loadGrid();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update the reservation.");
    } finally {
      setSaving(false);
    }
  }

  async function moveReservation(reservation: Reservation, table: DiningTable) {
    setDraggedReservationId(null);
    setDropTargetTableId(null);
    if (reservation.table_id === table.id) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(appPath(`/api/grid/reservations/${reservation.id}`), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ table_id: table.id }),
      });
      const payload = (await response.json()) as Reservation | Record<string, unknown>;
      if (!response.ok) throw new Error(readError(payload));
      if (selected?.id === reservation.id) {
        setSelected(payload as Reservation);
        await loadMoveHistory(reservation.id);
      }
      await loadGrid();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to move the reservation.");
    } finally {
      setSaving(false);
    }
  }

  async function unlockAssignment() {
    if (!selected || selected.assignment_type !== "hard") return;
    setUnlocking(true);
    setSaving(true);
    setError("");
    try {
      const response = await fetch(appPath(`/api/grid/reservations/${selected.id}`), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assignment_type: "soft" }),
      });
      const payload = (await response.json()) as Reservation | Record<string, unknown>;
      if (!response.ok) throw new Error(readError(payload));
      setSelected(payload as Reservation);
      await Promise.all([loadGrid(), loadMoveHistory(selected.id)]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to unlock the reservation.");
    } finally {
      setSaving(false);
      setUnlocking(false);
    }
  }

  function beginReservationDrag(event: DragEvent<HTMLButtonElement>, reservation: Reservation) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(reservation.id));
    setDraft(null);
    setSelected(null);
    setDraggedReservationId(reservation.id);
  }

  async function loadMoveHistory(reservationId: number) {
    setHistoryLoading(true);
    try {
      const response = await fetch(appPath(`/api/grid/reservations/${reservationId}/moves`), {
        cache: "no-store",
      });
      const payload = (await response.json()) as TableMove[] | Record<string, unknown>;
      if (!response.ok) throw new Error(readError(payload));
      setTableMoves(payload as TableMove[]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load table movement history.");
      setTableMoves([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function openReservation(reservation: Reservation) {
    setDraft(null);
    setUnlocking(false);
    setMoveHistoryOpen(false);
    setSelected(reservation);
    setTableMoves([]);
    await loadMoveHistory(reservation.id);
  }

  async function cancelReservation() {
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(appPath(`/api/grid/reservations/${selected.id}`), { method: "DELETE" });
      if (!response.ok) throw new Error("Unable to cancel the reservation.");
      setSelected(null);
      await loadGrid();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to cancel the reservation.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="reservation-page">
      <section className="grid-toolbar" aria-label="Reservation grid controls">
        <div className="toolbar-leading">
          <div className="shift-tabs" aria-label="Shift">
            {data?.shifts.map((shift) => (
              <button
                type="button"
                key={shift.id}
                className={shift.slug === data.selected_shift.slug ? "active" : ""}
                onClick={() => chooseShift(shift.slug)}
              >
                {shift.name}
                <span>{displayTime(shift.start_time)}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="date-control" aria-label="Choose service date">
          <button type="button" onClick={() => chooseDate(moveServiceDate(serviceDate, -1))} aria-label="Previous day">
            <ChevronLeft aria-hidden="true" />
          </button>
          <ServiceDatePicker value={serviceDate} onChange={chooseDate} />
          <button type="button" onClick={() => chooseDate(moveServiceDate(serviceDate, 1))} aria-label="Next day">
            <ChevronRight aria-hidden="true" />
          </button>
          <button
            className="now-button"
            type="button"
            onClick={returnToNow}
            aria-label="Return to current day and shift"
            title="Return to current day and shift"
          >
            <Clock3 aria-hidden="true" />
          </button>
        </div>
        <div className="service-summary" aria-label="Service summary">
          <span><strong>{data?.summary.reservations ?? 0}</strong> bookings</span>
          <span><strong>{data?.summary.covers ?? 0}</strong> covers</span>
          <span><strong>{data?.summary.seated ?? 0}</strong> seated</span>
        </div>
      </section>

      {error && <div className="grid-alert" role="alert">{error}</div>}

      {!bookingAllowed && (
        <div className="grid-read-only-notice" role="status">
          <CalendarX2 aria-hidden="true" />
          <span><strong>Past service · view only</strong> New reservations cannot be added to a previous day.</span>
        </div>
      )}

      <div className={`grid-and-panel ${draft || selected ? "has-panel" : ""}`}>
        <section className="grid-card" aria-label="Table reservation timeline">
          {loading && !data ? (
            <div className="grid-loading"><LoaderCircle aria-hidden="true" /> Loading the book…</div>
          ) : data ? (
            <div className="timeline-scroll" ref={timelineScrollRef}>
              <div className="timeline" style={{ minWidth: TABLE_COLUMNS_WIDTH + slots.length * SLOT_WIDTH }}>
                {currentTimeMarker && (
                  <div
                    className="current-time-indicator"
                    style={{ left: currentTimeMarker.left }}
                    role="img"
                    aria-label={`Current time: ${currentTimeMarker.label}`}
                  >
                    <span aria-hidden="true">Now · {currentTimeMarker.label}</span>
                  </div>
                )}
                <div className="timeline-header">
                  <div className="table-heading">Table</div>
                  <div className="capacity-heading">Max</div>
                  <div className="time-headings" style={{ width: slots.length * SLOT_WIDTH }}>
                    {slots.map((slot, index) => (
                      <div key={slot} className={index % 4 === 0 ? "hour" : ""} style={{ width: SLOT_WIDTH }}>
                        {index % 2 === 0 ? displayTime(slot).replace(" ", "\n") : ""}
                      </div>
                    ))}
                  </div>
                </div>
                {data.tables.map((table) => {
                  const tableReservations = data.reservations.filter((item) =>
                    (item.table_ids.length ? item.table_ids : [item.table_id]).includes(table.id),
                  );
                  const hasConflict = Boolean(
                    draggedReservation &&
                    tableReservations.some(
                      (item) =>
                        item.id !== draggedReservation.id &&
                        reservationsOverlap(item, draggedReservation),
                    ),
                  );
                  const isOriginalTable = draggedReservation?.table_id === table.id;
                  const isSuggested = Boolean(
                    draggedReservation &&
                    !isOriginalTable &&
                    !hasConflict &&
                    table.capacity >= draggedReservation.party_size,
                  );
                  const isTooSmall = Boolean(
                    draggedReservation &&
                    !isOriginalTable &&
                    table.capacity < draggedReservation.party_size,
                  );
                  const rowClassName = [
                    "timeline-row",
                    isSuggested ? "drag-suggested" : "",
                    isTooSmall ? "drag-too-small" : "",
                    draggedReservation && hasConflict ? "drag-conflict" : "",
                    dropTargetTableId === table.id ? "drop-active" : "",
                  ].filter(Boolean).join(" ");
                  return (
                    <div
                      className={rowClassName}
                      key={table.id}
                      onDragOver={(event) => {
                        if (!draggedReservation) return;
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                        setDropTargetTableId(table.id);
                      }}
                      onDragLeave={(event) => {
                        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                          setDropTargetTableId(null);
                        }
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        if (draggedReservation) {
                          void moveReservation(draggedReservation, table);
                        }
                      }}
                    >
                      <div className="table-name">{table.name}</div>
                      <div className="table-capacity"><Users aria-hidden="true" />{table.capacity}</div>
                      <div className="timeline-track" style={{ width: slots.length * SLOT_WIDTH }}>
                        {slots.map((slot) => (
                          <button
                            type="button"
                            key={slot}
                            className="empty-slot"
                            style={{ width: SLOT_WIDTH }}
                            disabled={!bookingAllowed}
                            onClick={() => {
                              if (!bookingAllowed) return;
                              setSelected(null);
                              setDraft({ tableId: table.id, tableName: table.name, capacity: table.capacity, time: slot });
                            }}
                            aria-label={bookingAllowed
                              ? `Book table ${table.name} at ${displayTime(slot)}`
                              : `Past date, table ${table.name} at ${displayTime(slot)} is view only`}
                            title={!bookingAllowed ? "Past dates are view only" : undefined}
                          >
                            <Plus aria-hidden="true" />
                          </button>
                        ))}
                        {tableReservations.map((reservation) => {
                          const offset = (minutes(reservation.start_time) - minutes(data.selected_shift.start_time)) / SLOT_MINUTES;
                          const width = (reservation.duration_minutes / SLOT_MINUTES) * SLOT_WIDTH;
                          const overCapacity = reservation.party_size > table.capacity;
                          const timeConflict = tableReservations.some(
                            (item) =>
                              item.id !== reservation.id &&
                              reservationsOverlap(item, reservation),
                          );
                          const warnings = [
                            overCapacity ? `Over by ${reservation.party_size - table.capacity}` : "",
                            timeConflict ? "Double booked" : "",
                          ].filter(Boolean);
                          return (
                            <button
                              type="button"
                              className={`reservation-block status-${reservation.status}${reservation.assignment_type === "hard" ? " hard-assigned" : ""}${overCapacity ? " over-capacity" : ""}${timeConflict ? " time-conflict" : ""}`}
                              key={reservation.id}
                              style={{ left: offset * SLOT_WIDTH + 2, width: width - 4 }}
                              onClick={() => void openReservation(reservation)}
                              draggable={!saving}
                              onDragStart={(event) => beginReservationDrag(event, reservation)}
                              onDragEnd={() => {
                                setDraggedReservationId(null);
                                setDropTargetTableId(null);
                              }}
                              aria-label={`${reservation.guest_name}, party of ${reservation.party_size}, ${displayTime(reservation.start_time)}${reservation.assignment_type === "hard" ? ", hard assigned" : ""}${overCapacity ? `, over table capacity by ${reservation.party_size - table.capacity}` : ""}${timeConflict ? ", double booked at this time" : ""}`}
                            >
                              {reservation.assignment_type === "hard" && (
                                <Lock className="reservation-lock-icon" aria-hidden="true" />
                              )}
                              <span>{reservation.guest_name}</span>
                              <small>
                                {reservation.party_size} guests · {reservation.duration_minutes} min
                                {warnings.length ? ` · ${warnings.join(" · ")}` : ""}
                              </small>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="grid-loading">The reservation grid could not be loaded.</div>
          )}
        </section>

        {(draft || selected) && (
          <aside className="booking-panel" aria-label={draft ? "New reservation" : "Reservation details"}>
            <button className="panel-close" type="button" onClick={() => { setDraft(null); setSelected(null); }} aria-label="Close panel">
              <X aria-hidden="true" />
            </button>
            {draft && data && (
              <form {...IGNORE_AUTOFILL} onSubmit={createReservation}>
                <p className="panel-eyebrow">New reservation</p>
                <h2>Table {draft.tableName}</h2>
                <div className="booking-meta"><Clock3 aria-hidden="true" /> {displayTime(draft.time)} · seats {draft.capacity}</div>
                <label>Guest name<input {...IGNORE_AUTOFILL} name="guest_name" required autoFocus placeholder="Guest name" /></label>
                <div className="form-pair">
                  <label>Party size<input {...IGNORE_AUTOFILL} name="party_size" type="number" min="1" max={draft.capacity} defaultValue={Math.min(2, draft.capacity)} required /></label>
                  <label>Turn time<select {...IGNORE_AUTOFILL} name="duration_minutes" defaultValue={data.selected_shift.default_turn_minutes}>
                    {[45, 60, 75, 90, 105, 120, 135, 150, 180].map((value) => <option key={value} value={value}>{value} min</option>)}
                  </select></label>
                </div>
                <label>Notes<textarea {...IGNORE_AUTOFILL} name="notes" rows={3} placeholder="Occasion, preferences, accessibility…" /></label>
                <button className="primary-action" type="submit" disabled={saving}>{saving ? "Saving…" : "Hold this table"}</button>
              </form>
            )}
            {selected && (
              <div>
                <p className="panel-eyebrow">Reservation</p>
                <h2>{selected.guest_name}</h2>
                <div className="booking-meta"><Clock3 aria-hidden="true" /> {displayTime(selected.start_time)} · {selected.table_names.length > 1 ? "Tables" : "Table"} {(selected.table_names.length ? selected.table_names : [selected.table_name]).join(" + ")}</div>
                <button
                  type="button"
                  className={`assignment-lock-button assignment-${selected.assignment_type}${unlocking ? " unlocking" : ""}`}
                  onClick={() => void unlockAssignment()}
                  disabled={saving || selected.assignment_type === "soft"}
                  aria-label={
                    selected.assignment_type === "hard"
                      ? "Unlock hard assignment and reflow reservation"
                      : "Reservation is soft assigned and unlocked"
                  }
                >
                  {selected.assignment_type === "hard" && !unlocking ? (
                    <Lock aria-hidden="true" />
                  ) : (
                    <Unlock className="unlock-icon" aria-hidden="true" />
                  )}
                  <span>
                    {unlocking
                      ? "Reflowing…"
                      : selected.assignment_type === "hard"
                        ? "Hard assigned"
                        : "Soft assigned"}
                  </span>
                </button>
                <dl className="reservation-details">
                  <div><dt>Party</dt><dd>{selected.party_size} guests</dd></div>
                  <div><dt>Turn</dt><dd>{selected.duration_minutes} minutes</dd></div>
                  <div><dt>Status</dt><dd>{selected.status}</dd></div>
                  {selected.guest_phone && <div><dt>Phone</dt><dd>{selected.guest_phone}</dd></div>}
                  {selected.guest_email && <div><dt>Email</dt><dd>{selected.guest_email}</dd></div>}
                  {selected.notes && <div><dt>Reservation notes</dt><dd>{selected.notes}</dd></div>}
                  {(selected.guest_profile_notes || selected.guest_notes) && <div><dt>Guest notes</dt><dd>{selected.guest_profile_notes || selected.guest_notes}</dd></div>}
                </dl>
                {selected.tags.length > 0 && <div className="reservation-tags" aria-label="Reservation tags">{selected.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>}
                {selected.guest_tags.length > 0 && <div className="reservation-tags guest-profile-tags" aria-label="Guest tags">{selected.guest_tags.map((tag) => <span key={tag}>{tag}</span>)}</div>}
                <label className="table-assignment">
                  Assigned table
                  <select
                    {...IGNORE_AUTOFILL}
                    value={selected.table_id}
                    disabled={saving}
                    onChange={(event) => {
                      const table = data?.tables.find((item) => item.id === Number(event.target.value));
                      if (table) void moveReservation(selected, table);
                    }}
                  >
                    {data?.tables.map((table) => (
                      <option key={table.id} value={table.id}>
                        Table {table.name} · {table.capacity} seats
                      </option>
                    ))}
                  </select>
                </label>
                <section className="move-history" aria-label="Table movement history">
                  <button
                    type="button"
                    className="move-history-toggle"
                    onClick={() => setMoveHistoryOpen((open) => !open)}
                    aria-expanded={moveHistoryOpen}
                    aria-controls="table-move-history-content"
                  >
                    <span>Table moves</span>
                    <span className="move-history-summary">
                      {!historyLoading && tableMoves.length > 0 && tableMoves.length}
                      <ChevronDown aria-hidden="true" />
                    </span>
                  </button>
                  {moveHistoryOpen && (
                    <div id="table-move-history-content" className="move-history-content">
                      {historyLoading ? (
                        <p>Loading history…</p>
                      ) : tableMoves.length ? (
                        <ol>
                          {tableMoves.map((move) => (
                            <li key={move.id}>
                              <span>Table {move.from_table_name} → Table {move.to_table_name}</span>
                              <small>
                                {move.move_type === "manual" ? "Manual · hard assigned" : "Automatic reflow"}
                                {move.triggered_by_guest_name && move.move_type === "reflow"
                                  ? ` · triggered by ${move.triggered_by_guest_name}`
                                  : ""}
                              </small>
                              <time dateTime={move.created_at}>
                                {new Intl.DateTimeFormat("en-US", {
                                  month: "short",
                                  day: "numeric",
                                  hour: "numeric",
                                  minute: "2-digit",
                                }).format(new Date(move.created_at))}
                              </time>
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <p>No table moves yet.</p>
                      )}
                    </div>
                  )}
                </section>
                <div className="status-actions">
                  {selected.status !== "seated" && <button type="button" onClick={() => void updateStatus("seated")} disabled={saving}>Mark seated</button>}
                  {selected.status !== "complete" && <button type="button" onClick={() => void updateStatus("complete")} disabled={saving}>Complete</button>}
                </div>
                <button className="danger-action" type="button" onClick={() => void cancelReservation()} disabled={saving}>Cancel reservation</button>
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
