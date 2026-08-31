"use client";

import {
  Check,
  ChevronLeft,
  ChevronRight,
  CirclePlus,
  Clock3,
  GripVertical,
  LoaderCircle,
  Plus,
  Search,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { DragEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { ServiceDatePicker } from "@/components/service-date-picker";
import { appPath } from "@/lib/app-paths";

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

type ServiceStatus =
  | "confirmed"
  | "seated"
  | "entree"
  | "dessert"
  | "check_dropped"
  | "paid"
  | "complete"
  | "cancelled";

type Reservation = {
  id: number;
  guest_id: number | null;
  table_id: number;
  table_name: string;
  table_ids: number[];
  table_names: string[];
  guest_name: string;
  party_size: number;
  start_time: string;
  duration_minutes: number;
  status: ServiceStatus;
  notes: string;
  tags: string[];
};

type GuestRecord = {
  id: number;
  first_name: string;
  last_name: string;
  full_name: string;
};

type GuestSearchResponse = { results: GuestRecord[] };

type WalkInDraft = {
  partySize: number;
  guestId: number | null;
  guestName: string;
};

type GridData = {
  restaurant: { id: number; name: string };
  service_date: string;
  booking_allowed: boolean;
  shifts: Shift[];
  selected_shift: Shift;
  tables: DiningTable[];
  reservations: Reservation[];
  summary: { reservations: number; covers: number; seated: number };
};

const ACTIVE_STATUSES: ServiceStatus[] = [
  "seated",
  "entree",
  "dessert",
  "check_dropped",
  "paid",
];

const SERVICE_STEPS: Array<{ value: ServiceStatus; label: string }> = [
  { value: "seated", label: "Seated" },
  { value: "entree", label: "Entree" },
  { value: "dessert", label: "Dessert" },
  { value: "check_dropped", label: "Check dropped" },
  { value: "paid", label: "Paid" },
  { value: "complete", label: "Done" },
];

function localDateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function todayLocal() {
  return localDateValue(new Date());
}

function moveDate(value: string, amount: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function displayTime(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
}

function closestServiceOccurrence(shifts: Shift[], now = new Date()) {
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

function statusLabel(status: ServiceStatus) {
  return SERVICE_STEPS.find((step) => step.value === status)?.label || status;
}

function readError(payload: unknown) {
  if (!payload || typeof payload !== "object") return "Something went wrong.";
  const first = Object.values(payload as Record<string, unknown>)[0];
  if (Array.isArray(first)) return String(first[0]);
  return typeof first === "string" ? first : "Something went wrong.";
}

export function FloorWorkspace() {
  const [serviceDate, setServiceDate] = useState(todayLocal);
  const [shiftSlug, setShiftSlug] = useState("dinner");
  const [data, setData] = useState<GridData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [selectedPendingId, setSelectedPendingId] = useState<number | null>(null);
  const [focusedReservationId, setFocusedReservationId] = useState<number | null>(null);
  const [draggedReservationId, setDraggedReservationId] = useState<number | null>(null);
  const [dropTargetTableId, setDropTargetTableId] = useState<number | null>(null);
  const [addTableOpen, setAddTableOpen] = useState(false);
  const [seatingMode, setSeatingMode] = useState<"reservation" | "walk-in" | null>(null);
  const [selectedTableIds, setSelectedTableIds] = useState<number[]>([]);
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [walkInPartySize, setWalkInPartySize] = useState(2);
  const [walkInGuestQuery, setWalkInGuestQuery] = useState("");
  const [walkInGuestResults, setWalkInGuestResults] = useState<GuestRecord[]>([]);
  const [walkInSelectedGuest, setWalkInSelectedGuest] = useState<GuestRecord | null>(null);
  const [walkInDraft, setWalkInDraft] = useState<WalkInDraft | null>(null);
  const [guestSearchLoading, setGuestSearchLoading] = useState(false);
  const [creatingGuest, setCreatingGuest] = useState(false);

  const loadFloor = useCallback(async () => {
    setLoading(true);
    setError("");
    const query = new URLSearchParams({ date: serviceDate, shift: shiftSlug });
    try {
      const response = await fetch(`${appPath("/api/grid")}?${query}`, { cache: "no-store" });
      const payload = (await response.json()) as GridData | Record<string, unknown>;
      if (!response.ok) throw new Error(readError(payload));
      const next = payload as GridData;
      setData(next);
      setShiftSlug(next.selected_shift.slug);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load the floor plan.");
    } finally {
      setLoading(false);
    }
  }, [serviceDate, shiftSlug]);

  useEffect(() => {
    // Refresh the floor whenever the service date or shift changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadFloor();
  }, [loadFloor]);

  useEffect(() => {
    if (!walkInOpen) return;
    const query = walkInGuestQuery.trim();
    if (!query) return;

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setGuestSearchLoading(true);
      try {
        const response = await fetch(`${appPath("/api/guests")}?q=${encodeURIComponent(query)}&limit=6`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json()) as GuestSearchResponse | Record<string, unknown>;
        if (!response.ok) throw new Error(readError(payload));
        setWalkInGuestResults((payload as GuestSearchResponse).results);
      } catch (reason) {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) {
          setError(reason instanceof Error ? reason.message : "Unable to search guests.");
        }
      } finally {
        if (!controller.signal.aborted) setGuestSearchLoading(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [walkInGuestQuery, walkInOpen]);

  const pendingReservations = useMemo(
    () => data?.reservations.filter((reservation) => reservation.status === "confirmed") || [],
    [data],
  );
  const activeReservations = useMemo(
    () => data?.reservations.filter((reservation) => ACTIVE_STATUSES.includes(reservation.status)) || [],
    [data],
  );
  const activeByTable = useMemo(
    () => new Map(
      activeReservations.flatMap((reservation) =>
        (reservation.table_ids.length ? reservation.table_ids : [reservation.table_id]).map(
          (tableId) => [tableId, reservation] as const,
        ),
      ),
    ),
    [activeReservations],
  );
  const selectedPending = pendingReservations.find((item) => item.id === selectedPendingId) || null;
  const draggedReservation = pendingReservations.find((item) => item.id === draggedReservationId) || null;
  const focusedReservation = activeReservations.find((item) => item.id === focusedReservationId) || null;
  const liveService = serviceDate === todayLocal();

  function cancelSeating() {
    setSeatingMode(null);
    setSelectedTableIds([]);
    setWalkInDraft(null);
  }

  function chooseDate(value: string) {
    cancelSeating();
    setSelectedPendingId(null);
    setFocusedReservationId(null);
    setServiceDate(value);
  }

  function chooseShift(value: string) {
    cancelSeating();
    setSelectedPendingId(null);
    setFocusedReservationId(null);
    setShiftSlug(value);
  }

  function jumpToNow() {
    cancelSeating();
    setSelectedPendingId(null);
    setFocusedReservationId(null);
    const now = new Date();
    const closest = closestServiceOccurrence(data?.shifts || [], now);
    setServiceDate(closest?.date || localDateValue(now));
    if (closest) setShiftSlug(closest.shiftSlug);
  }

  async function updateReservation(
    reservation: Reservation,
    updates: { table_id?: number; table_ids?: number[]; status?: ServiceStatus },
  ) {
    if (!liveService) return false;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(appPath(`/api/grid/reservations/${reservation.id}`), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(updates),
      });
      const payload = (await response.json()) as Reservation | Record<string, unknown>;
      if (!response.ok) throw new Error(readError(payload));
      if (updates.status === "complete") setFocusedReservationId(null);
      setSelectedPendingId(null);
      await loadFloor();
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update the table.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function seatAtTable(reservation: Reservation, table: DiningTable) {
    if (activeByTable.has(table.id) || !liveService) return;
    void updateReservation(reservation, { table_ids: [table.id], status: "seated" });
  }

  function toggleSeatingTable(tableId: number) {
    setSelectedTableIds((current) =>
      current.includes(tableId)
        ? current.filter((selectedId) => selectedId !== tableId)
        : [...current, tableId],
    );
  }

  async function createWalkInGuest() {
    const name = walkInGuestQuery.trim();
    if (!name) return;
    const [firstName, ...lastNameParts] = name.split(/\s+/);
    setCreatingGuest(true);
    setError("");
    try {
      const response = await fetch(appPath("/api/guests"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastNameParts.join(" "),
          phone_number: "",
        }),
      });
      const payload = (await response.json()) as GuestRecord | Record<string, unknown>;
      if (!response.ok) throw new Error(readError(payload));
      const guest = payload as GuestRecord;
      setWalkInSelectedGuest(guest);
      setWalkInGuestQuery(guest.full_name);
      setWalkInGuestResults([]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to add the guest.");
    } finally {
      setCreatingGuest(false);
    }
  }

  function continueWalkIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWalkInDraft({
      partySize: walkInPartySize,
      guestId: walkInSelectedGuest?.id || null,
      guestName: walkInSelectedGuest?.full_name || walkInGuestQuery.trim(),
    });
    setSelectedPendingId(null);
    setSelectedTableIds([]);
    setSeatingMode("walk-in");
    setWalkInOpen(false);
  }

  async function seatOrFinish() {
    if (!seatingMode) {
      if (!selectedPending) return;
      setSeatingMode("reservation");
      setSelectedTableIds(
        selectedPending.table_ids.length ? selectedPending.table_ids : [selectedPending.table_id],
      );
      return;
    }
    if (!selectedTableIds.length) return;

    if (seatingMode === "reservation" && selectedPending) {
      const completed = await updateReservation(selectedPending, {
        table_ids: selectedTableIds,
        status: "seated",
      });
      if (completed) cancelSeating();
      return;
    }

    if (seatingMode === "walk-in" && walkInDraft && data) {
      setSaving(true);
      setError("");
      try {
        const response = await fetch(appPath("/api/grid/walk-ins"), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            service_date: serviceDate,
            shift_slug: data.selected_shift.slug,
            table_ids: selectedTableIds,
            guest_id: walkInDraft.guestId || undefined,
            guest_name: walkInDraft.guestName,
            party_size: walkInDraft.partySize,
          }),
        });
        const payload = (await response.json()) as Reservation | Record<string, unknown>;
        if (!response.ok) throw new Error(readError(payload));
        cancelSeating();
        await loadFloor();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Unable to seat the walk-in.");
      } finally {
        setSaving(false);
      }
    }
  }

  function dropReservation(event: DragEvent<HTMLButtonElement>, table: DiningTable) {
    event.preventDefault();
    setDropTargetTableId(null);
    setDraggedReservationId(null);
    if (draggedReservation) seatAtTable(draggedReservation, table);
  }

  async function addTable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data) return;
    setSaving(true);
    setError("");
    const values = new FormData(event.currentTarget);
    const tableIndex = data.tables.length;
    const payload = {
      name: String(values.get("name") || "").trim(),
      capacity: Number(values.get("capacity")),
      shape: values.get("shape"),
      position_x: 10 + (tableIndex % 4) * 25,
      position_y: 18 + (Math.floor(tableIndex / 4) % 3) * 34,
    };
    try {
      const response = await fetch(appPath("/api/grid/tables"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const responsePayload = (await response.json()) as Record<string, unknown>;
      if (!response.ok) throw new Error(readError(responsePayload));
      setAddTableOpen(false);
      await loadFloor();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to create the table.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="app-shell">
      <AppSidebar />
      <main className="main-content floor-main-content">
        <div className="floor-page">
          <header className="floor-toolbar">
            <div>
              <p className="floor-kicker">Live service</p>
              <h1>Floor plan</h1>
            </div>
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
            <div className="date-control" aria-label="Choose service date">
              <button type="button" onClick={() => chooseDate(moveDate(serviceDate, -1))} aria-label="Previous day">
                <ChevronLeft aria-hidden="true" />
              </button>
              <ServiceDatePicker value={serviceDate} onChange={chooseDate} />
              <button type="button" onClick={() => chooseDate(moveDate(serviceDate, 1))} aria-label="Next day">
                <ChevronRight aria-hidden="true" />
              </button>
              <button className="now-button" type="button" onClick={jumpToNow} aria-label="Go to the closest service now">
                <Clock3 aria-hidden="true" />
              </button>
            </div>
          </header>

          {error && <div className="grid-alert floor-alert" role="alert">{error}</div>}
          {!liveService && (
            <div className="floor-read-only" role="status">
              Viewing another service date. Return to today to seat parties or change table statuses.
            </div>
          )}

          <div className="floor-service-layout">
            <aside className="floor-reservations-panel" aria-label="Pending reservations">
              <div className="floor-panel-heading">
                <div>
                  <span>Waiting to be seated</span>
                  <h2>Reservations</h2>
                </div>
                <strong>{pendingReservations.length}</strong>
              </div>
              <p className="floor-help">Drag a party onto an available table, or select a party and then a table.</p>
              <div className="floor-reservation-list">
                {loading && !data ? (
                  <div className="floor-empty"><LoaderCircle className="spin" aria-hidden="true" /> Loading service…</div>
                ) : pendingReservations.length ? pendingReservations.map((reservation) => (
                  <button
                    type="button"
                    key={reservation.id}
                    draggable={liveService && !seatingMode}
                    className={selectedPendingId === reservation.id ? "selected" : ""}
                    onClick={() => {
                      if (!seatingMode) {
                        setSelectedPendingId((current) => current === reservation.id ? null : reservation.id);
                      }
                    }}
                    onDragStart={() => {
                      if (seatingMode) return;
                      setDraggedReservationId(reservation.id);
                      setSelectedPendingId(reservation.id);
                    }}
                    onDragEnd={() => {
                      setDraggedReservationId(null);
                      setDropTargetTableId(null);
                    }}
                    aria-label={`${displayTime(reservation.start_time)}, ${reservation.guest_name}, party of ${reservation.party_size}, assigned to ${reservation.table_names.length > 1 ? "Tables" : "Table"} ${(reservation.table_names.length ? reservation.table_names : [reservation.table_name]).join(", ")}`}
                    aria-pressed={selectedPendingId === reservation.id}
                  >
                    <time>{displayTime(reservation.start_time)}</time>
                    <span className="floor-reservation-details">
                      <strong>{reservation.guest_name}</strong>
                      <small><Users aria-hidden="true" /> Party of {reservation.party_size}</small>
                      {reservation.notes && <em>{reservation.notes}</em>}
                    </span>
                    <span className="floor-reservation-tail" aria-hidden="true">
                      <span className="floor-reservation-table">
                        <small>{reservation.table_names.length > 1 ? "Tables" : "Table"}</small>
                        <strong>{(reservation.table_names.length ? reservation.table_names : [reservation.table_name]).join("+")}</strong>
                      </span>
                      <GripVertical />
                    </span>
                  </button>
                )) : (
                  <div className="floor-empty"><Check aria-hidden="true" /><strong>All caught up</strong><span>No pending parties for this shift.</span></div>
                )}
              </div>
              {seatingMode && (
                <div className="floor-seating-prompt" role="status">
                  <strong>
                    {seatingMode === "walk-in"
                      ? `${walkInDraft?.guestName || "Walk-in"} · Party of ${walkInDraft?.partySize}`
                      : selectedPending?.guest_name}
                  </strong>
                  <span>Select one or more available tables, then finish seating.</span>
                </div>
              )}
              <div className="floor-reservation-actions">
                <button
                  type="button"
                  className="floor-seat-action"
                  onClick={() => void seatOrFinish()}
                  disabled={
                    saving
                    || !liveService
                    || (!seatingMode && !selectedPending)
                    || (Boolean(seatingMode) && selectedTableIds.length === 0)
                  }
                >
                  {seatingMode ? "Finish Seating" : "Seat"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWalkInOpen(true);
                    setWalkInPartySize(2);
                    setWalkInGuestQuery("");
                    setWalkInSelectedGuest(null);
                    setWalkInGuestResults([]);
                  }}
                  disabled={saving || !liveService || Boolean(seatingMode)}
                >
                  Walk In
                </button>
                {seatingMode && (
                  <button type="button" className="floor-cancel-seating" onClick={cancelSeating}>
                    Cancel
                  </button>
                )}
              </div>
            </aside>

            <section className="floor-plan-panel" aria-label="Restaurant floor plan">
              <div className="floor-plan-heading">
                <div>
                  <span>Dining room</span>
                  <h2>{data?.restaurant.name || "Floor"}</h2>
                </div>
                <div className="floor-plan-actions">
                  <span><strong>{activeByTable.size}</strong> of {data?.tables.length || 0} occupied</span>
                  <button type="button" onClick={() => setAddTableOpen(true)} disabled={saving}>
                    <Plus aria-hidden="true" /> Add table
                  </button>
                </div>
              </div>

              <div className={`floor-canvas${seatingMode ? " assigning seating" : ""}`}>
                {loading && !data ? (
                  <div className="floor-canvas-loading"><LoaderCircle className="spin" aria-hidden="true" /> Loading tables…</div>
                ) : data?.tables.map((table) => {
                  const reservation = activeByTable.get(table.id);
                  const available = !reservation;
                  return (
                    <button
                      type="button"
                      key={table.id}
                      className={`floor-table floor-table-${table.shape}${available ? " available" : ` occupied status-${reservation.status}`}${dropTargetTableId === table.id ? " drop-target" : ""}${selectedTableIds.includes(table.id) ? " seat-selected" : ""}`}
                      style={{ left: `${table.position_x}%`, top: `${table.position_y}%` }}
                      onClick={() => {
                        if (reservation) {
                          setFocusedReservationId(reservation.id);
                        } else if (seatingMode) {
                          toggleSeatingTable(table.id);
                        }
                      }}
                      onDragOver={(event) => {
                        if (!available || !draggedReservation || !liveService) return;
                        event.preventDefault();
                        setDropTargetTableId(table.id);
                      }}
                      onDragLeave={() => setDropTargetTableId(null)}
                      onDrop={(event) => dropReservation(event, table)}
                      aria-pressed={seatingMode ? selectedTableIds.includes(table.id) : undefined}
                      aria-label={reservation ? `Table ${table.name}, ${reservation.guest_name}, ${statusLabel(reservation.status)}` : `Table ${table.name}, available, seats ${table.capacity}${selectedTableIds.includes(table.id) ? ", selected for seating" : ""}`}
                    >
                      <i className="chair chair-top" aria-hidden="true" />
                      <i className="chair chair-right" aria-hidden="true" />
                      <i className="chair chair-bottom" aria-hidden="true" />
                      <i className="chair chair-left" aria-hidden="true" />
                      <span className="floor-table-surface">
                        <strong>{table.name}</strong>
                        {reservation ? (
                          <>
                            <small>{reservation.guest_name}</small>
                            <em>{statusLabel(reservation.status)}</em>
                          </>
                        ) : (
                          <><small>{table.capacity} seats</small><em>Available</em></>
                        )}
                      </span>
                    </button>
                  );
                })}
                {data && data.tables.length === 0 && (
                  <div className="floor-canvas-loading"><CirclePlus aria-hidden="true" /> Add the first table to this floor.</div>
                )}
              </div>

              {focusedReservation && (
                <div className="floor-status-dock" aria-label={`Update ${focusedReservation.guest_name}`}>
                  <button type="button" className="floor-dock-close" onClick={() => setFocusedReservationId(null)} aria-label="Close table details"><X aria-hidden="true" /></button>
                  <div>
                    <span>{focusedReservation.table_names.length > 1 ? "Tables" : "Table"} {(focusedReservation.table_names.length ? focusedReservation.table_names : [focusedReservation.table_name]).join(" + ")}</span>
                    <strong>{focusedReservation.guest_name}</strong>
                    <small>{displayTime(focusedReservation.start_time)} · Party of {focusedReservation.party_size}</small>
                  </div>
                  <div className="floor-status-actions">
                    {SERVICE_STEPS.map((step) => (
                      <button
                        type="button"
                        key={step.value}
                        className={focusedReservation.status === step.value ? "active" : ""}
                        disabled={saving || !liveService}
                        onClick={() => void updateReservation(focusedReservation, { status: step.value })}
                      >
                        {step.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </div>

          {addTableOpen && (
            <div className="floor-dialog-backdrop" role="presentation" onMouseDown={(event) => {
              if (event.target === event.currentTarget) setAddTableOpen(false);
            }}>
              <form className="floor-dialog" onSubmit={addTable} aria-labelledby="add-table-title">
                <button type="button" className="floor-dialog-close" onClick={() => setAddTableOpen(false)} aria-label="Close add table"><X aria-hidden="true" /></button>
                <span>Floor setup</span>
                <h2 id="add-table-title">Add a table</h2>
                <p>The new table will also appear in the reservation grid.</p>
                <label>Table number or name<input name="name" required maxLength={40} autoFocus placeholder="9" /></label>
                <label>Seats<input name="capacity" type="number" required min={1} max={40} defaultValue={4} /></label>
                <label>Shape<select name="shape" defaultValue="rectangle"><option value="rectangle">Rectangle</option><option value="round">Round</option></select></label>
                <button type="submit" className="floor-dialog-submit" disabled={saving}>{saving ? "Adding…" : "Add to floor"}</button>
              </form>
            </div>
          )}

          {walkInOpen && (
            <div className="floor-dialog-backdrop" role="presentation" onMouseDown={(event) => {
              if (event.target === event.currentTarget) setWalkInOpen(false);
            }}>
              <form className="floor-dialog floor-walk-in-dialog" onSubmit={continueWalkIn} aria-labelledby="walk-in-title">
                <button type="button" className="floor-dialog-close" onClick={() => setWalkInOpen(false)} aria-label="Close walk-in"><X aria-hidden="true" /></button>
                <span>Seat without a reservation</span>
                <h2 id="walk-in-title">Add a walk-in</h2>
                <p>Enter the party size, then optionally find or add the guest.</p>
                <label>
                  Party size
                  <input
                    type="number"
                    min={1}
                    max={40}
                    required
                    value={walkInPartySize}
                    onChange={(event) => setWalkInPartySize(Number(event.target.value))}
                    autoFocus
                  />
                </label>
                <label>
                  Guest name <small>Optional</small>
                  <span className="floor-guest-search-field">
                    <Search aria-hidden="true" />
                    <input
                      value={walkInGuestQuery}
                      onChange={(event) => {
                        setWalkInGuestQuery(event.target.value);
                        setWalkInSelectedGuest(null);
                      }}
                      placeholder="Search the guest database"
                    />
                    {guestSearchLoading && <LoaderCircle className="spin" aria-hidden="true" />}
                  </span>
                </label>
                {walkInSelectedGuest && (
                  <div className="floor-selected-guest">
                    <Check aria-hidden="true" />
                    <span><strong>{walkInSelectedGuest.full_name}</strong><small>Guest selected</small></span>
                    <button type="button" onClick={() => setWalkInSelectedGuest(null)}>Change</button>
                  </div>
                )}
                {!walkInSelectedGuest && walkInGuestResults.length > 0 && (
                  <div className="floor-guest-results" aria-label="Guest search results">
                    {walkInGuestResults.map((guest) => (
                      <button
                        type="button"
                        key={guest.id}
                        onClick={() => {
                          setWalkInSelectedGuest(guest);
                          setWalkInGuestQuery(guest.full_name);
                          setWalkInGuestResults([]);
                        }}
                      >
                        <strong>{guest.full_name}</strong>
                        <span>Use guest</span>
                      </button>
                    ))}
                  </div>
                )}
                {!walkInSelectedGuest && walkInGuestQuery.trim() && (
                  <button
                    type="button"
                    className="floor-add-guest"
                    onClick={() => void createWalkInGuest()}
                    disabled={creatingGuest}
                  >
                    {creatingGuest ? <LoaderCircle className="spin" aria-hidden="true" /> : <UserPlus aria-hidden="true" />}
                    Add “{walkInGuestQuery.trim()}” to guests
                  </button>
                )}
                <button type="submit" className="floor-dialog-submit">
                  Continue to tables
                </button>
              </form>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
