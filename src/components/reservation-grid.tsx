"use client";

import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  LoaderCircle,
  Plus,
  Users,
  X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

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
  notes: string;
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

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(`${value}T12:00:00`));
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
      <header className="reservation-header">
        <div>
          <p className="page-eyebrow">Reservations</p>
          <h1 className="page-title">{data?.restaurant.name || "The reservation book"}</h1>
          <p className="service-date-label">{dateLabel(serviceDate)}</p>
        </div>
        <div className="date-control" aria-label="Choose service date">
          <button type="button" onClick={() => chooseDate(moveDate(serviceDate, -1))} aria-label="Previous day">
            <ChevronLeft aria-hidden="true" />
          </button>
          <label>
            <CalendarDays aria-hidden="true" />
            <span>{serviceDate === todayLocal() ? "Today" : dateLabel(serviceDate)}</span>
            <input type="date" value={serviceDate} onChange={(event) => chooseDate(event.target.value)} />
          </label>
          <button type="button" onClick={() => chooseDate(moveDate(serviceDate, 1))} aria-label="Next day">
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
      </header>

      <section className="grid-toolbar" aria-label="Reservation grid controls">
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
                  return (
                    <div className="timeline-row" key={table.id}>
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
                          return (
                            <button
                              type="button"
                              className={`reservation-block status-${reservation.status}`}
                              key={reservation.id}
                              style={{ left: offset * SLOT_WIDTH + 2, width: width - 4 }}
                              onClick={() => { setDraft(null); setSelected(reservation); }}
                              aria-label={`${reservation.guest_name}, party of ${reservation.party_size}, ${displayTime(reservation.start_time)}`}
                            >
                              <span>{reservation.guest_name}</span>
                              <small>{reservation.party_size} guests · {reservation.duration_minutes} min</small>
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
                <dl className="reservation-details">
                  <div><dt>Party</dt><dd>{selected.party_size} guests</dd></div>
                  <div><dt>Turn</dt><dd>{selected.duration_minutes} minutes</dd></div>
                  <div><dt>Status</dt><dd>{selected.status}</dd></div>
                  {selected.notes && <div><dt>Notes</dt><dd>{selected.notes}</dd></div>}
                </dl>
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
