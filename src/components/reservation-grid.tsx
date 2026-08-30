"use client";

import {
  CalendarPlus2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  LoaderCircle,
  Lock,
  Plus,
  Unlock,
  Users,
  X,
} from "lucide-react";
import { DragEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { BookingWizard } from "@/components/booking-wizard";
import { ServiceDatePicker } from "@/components/service-date-picker";

type Shift = {
  id: number;
  name: string;
  slug: string;
  start_time: string;
  end_time: string;
  default_turn_minutes: number;
};

type DiningTable = { id: number; name: string; capacity: number; sort_order: number };

type Reservation = {
  id: number;
  table_id: number;
  table_name: string;
  guest_name: string;
  party_size: number;
  start_time: string;
  duration_minutes: number;
  status: "confirmed" | "seated" | "complete" | "cancelled";
  assignment_type: "soft" | "hard";
  guest_phone: string;
  guest_email: string;
  guest_notes: string;
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

function todayLocal() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function moveDate(value: string, amount: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function shiftForNow(shifts: Shift[]) {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const activeShift = shifts.find(
    (shift) =>
      minutes(shift.start_time) <= currentMinutes && currentMinutes < minutes(shift.end_time),
  );
  const upcomingShift = shifts.find((shift) => minutes(shift.start_time) > currentMinutes);
  return activeShift?.slug || upcomingShift?.slug || shifts.at(-1)?.slug || "dinner";
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

export function ReservationGrid() {
  const [serviceDate, setServiceDate] = useState(todayLocal);
  const [shiftSlug, setShiftSlug] = useState("dinner");
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
  const [wizardOpen, setWizardOpen] = useState(false);

  const loadGrid = useCallback(async () => {
    setLoading(true);
    setError("");
    const query = new URLSearchParams({ date: serviceDate });
    if (shiftSlug) query.set("shift", shiftSlug);
    try {
      const response = await fetch(`/api/grid?${query}`, { cache: "no-store" });
      const payload = (await response.json()) as GridData | Record<string, unknown>;
      if (!response.ok) throw new Error(readError(payload));
      const next = payload as GridData;
      setData(next);
      setShiftSlug(next.selected_shift.slug);
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

  const slots = useMemo(() => {
    if (!data) return [];
    const start = minutes(data.selected_shift.start_time);
    const end = minutes(data.selected_shift.end_time);
    return Array.from({ length: (end - start) / SLOT_MINUTES }, (_, index) =>
      timeFromMinutes(start + index * SLOT_MINUTES),
    );
  }, [data]);

  const draggedReservation = useMemo(
    () => data?.reservations.find((item) => item.id === draggedReservationId) || null,
    [data, draggedReservationId],
  );

  function chooseDate(next: string) {
    setDraft(null);
    setSelected(null);
    setServiceDate(next);
  }

  function chooseShift(next: string) {
    setDraft(null);
    setSelected(null);
    setShiftSlug(next);
  }

  function returnToNow() {
    setDraft(null);
    setSelected(null);
    setServiceDate(todayLocal());
    setShiftSlug(shiftForNow(data?.shifts || []));
  }

  function finishWizardBooking(bookedDate: string, bookedShift: string) {
    setWizardOpen(false);
    setDraft(null);
    setSelected(null);
    if (bookedDate === serviceDate && bookedShift === shiftSlug) {
      void loadGrid();
      return;
    }
    setServiceDate(bookedDate);
    setShiftSlug(bookedShift);
  }

  async function createReservation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || !data) return;
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
      const response = await fetch("/api/grid", {
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
      const response = await fetch(`/api/grid/reservations/${selected.id}`, {
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
      const response = await fetch(`/api/grid/reservations/${reservation.id}`, {
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
      const response = await fetch(`/api/grid/reservations/${selected.id}`, {
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
      const response = await fetch(`/api/grid/reservations/${reservationId}/moves`, {
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
      const response = await fetch(`/api/grid/reservations/${selected.id}`, { method: "DELETE" });
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
          <button
            type="button"
            className="booking-launcher"
            onClick={() => { setDraft(null); setSelected(null); setWizardOpen(true); }}
            aria-label="Book a reservation"
            data-tooltip="Book a reservation"
          >
            <CalendarPlus2 aria-hidden="true" />
          </button>
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
          <button type="button" onClick={() => chooseDate(moveDate(serviceDate, -1))} aria-label="Previous day">
            <ChevronLeft aria-hidden="true" />
          </button>
          <ServiceDatePicker value={serviceDate} onChange={chooseDate} />
          <button type="button" onClick={() => chooseDate(moveDate(serviceDate, 1))} aria-label="Next day">
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

      <div className={`grid-and-panel ${draft || selected ? "has-panel" : ""}`}>
        <section className="grid-card" aria-label="Table reservation timeline">
          {loading && !data ? (
            <div className="grid-loading"><LoaderCircle aria-hidden="true" /> Loading the book…</div>
          ) : data ? (
            <div className="timeline-scroll">
              <div className="timeline" style={{ minWidth: 140 + slots.length * SLOT_WIDTH }}>
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
                  const tableReservations = data.reservations.filter((item) => item.table_id === table.id);
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
                            onClick={() => {
                              setSelected(null);
                              setDraft({ tableId: table.id, tableName: table.name, capacity: table.capacity, time: slot });
                            }}
                            aria-label={`Book table ${table.name} at ${displayTime(slot)}`}
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
              <form onSubmit={createReservation}>
                <p className="panel-eyebrow">New reservation</p>
                <h2>Table {draft.tableName}</h2>
                <div className="booking-meta"><Clock3 aria-hidden="true" /> {displayTime(draft.time)} · seats {draft.capacity}</div>
                <label>Guest name<input name="guest_name" required autoFocus placeholder="Guest name" /></label>
                <div className="form-pair">
                  <label>Party size<input name="party_size" type="number" min="1" max={draft.capacity} defaultValue={Math.min(2, draft.capacity)} required /></label>
                  <label>Turn time<select name="duration_minutes" defaultValue={data.selected_shift.default_turn_minutes}>
                    {[45, 60, 75, 90, 105, 120, 135, 150, 180].map((value) => <option key={value} value={value}>{value} min</option>)}
                  </select></label>
                </div>
                <label>Notes<textarea name="notes" rows={3} placeholder="Occasion, preferences, accessibility…" /></label>
                <button className="primary-action" type="submit" disabled={saving}>{saving ? "Saving…" : "Hold this table"}</button>
              </form>
            )}
            {selected && (
              <div>
                <p className="panel-eyebrow">Reservation</p>
                <h2>{selected.guest_name}</h2>
                <div className="booking-meta"><Clock3 aria-hidden="true" /> {displayTime(selected.start_time)} · Table {selected.table_name}</div>
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
                  {selected.notes && <div><dt>Notes</dt><dd>{selected.notes}</dd></div>}
                  {selected.guest_notes && <div><dt>Guest notes</dt><dd>{selected.guest_notes}</dd></div>}
                </dl>
                {selected.tags.length > 0 && <div className="reservation-tags" aria-label="Guest tags">{selected.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>}
                <label className="table-assignment">
                  Assigned table
                  <select
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
      {wizardOpen && (
        <BookingWizard
          initialDate={serviceDate}
          initialTime={data?.selected_shift.start_time || "18:00"}
          initialDuration={data?.selected_shift.default_turn_minutes || 90}
          onClose={() => setWizardOpen(false)}
          onBooked={finishWizardBooking}
        />
      )}
    </div>
  );
}
