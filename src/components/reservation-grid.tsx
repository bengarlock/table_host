"use client";

import {
  Armchair,
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  CakeSlice,
  CalendarX2,
  CalendarCheck,
  Ban,
  Check,
  CircleCheckBig,
  CircleCheck,
  CircleDollarSign,
  CircleHelp,
  Clock3,
  ClockAlert,
  LoaderCircle,
  Lock,
  Mail,
  Minus,
  Plus,
  ReceiptText,
  Utensils,
  UserX,
  Users,
  X,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { DragEvent, FormEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ServiceDatePicker } from "@/components/service-date-picker";
import { TagIcon } from "@/components/tag-icon";
import { PhoneInput } from "@/components/phone-input";
import { appPath } from "@/lib/app-paths";
import { IGNORE_AUTOFILL } from "@/lib/autofill";
import { formatTurnTime } from "@/lib/turn-time";
import { GUEST_TAGS, RESERVATION_TAGS } from "@/lib/reservation-tags";
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
    | "booked"
    | "confirmed"
    | "late"
    | "not_confirmed"
    | "seated"
    | "entree"
    | "dessert"
    | "check_dropped"
    | "paid"
    | "complete"
    | "cancelled"
    | "no_show";
  assignment_type: "soft" | "hard";
  is_unassigned: boolean;
  guest_phone: string;
  guest_email: string;
  guest_notes: string;
  guest_profile_notes: string;
  guest_tags: string[];
  tags: string[];
  notes: string;
};

type TableBlock = {
  id: number;
  table_ids: number[];
  table_names: string[];
  start_time: string;
  duration_minutes: number;
  notes: string;
};

const RESERVATION_STATUS_OPTIONS = [
  { value: "booked" as const, label: "Booked", icon: CalendarCheck },
  { value: "confirmed" as const, label: "Confirmed", icon: BadgeCheck },
  { value: "late" as const, label: "Late", icon: ClockAlert },
  { value: "not_confirmed" as const, label: "Not confirmed", icon: CircleHelp },
  { value: "seated" as const, label: "Seated", icon: Armchair },
  { value: "entree" as const, label: "Entree", icon: Utensils },
  { value: "dessert" as const, label: "Dessert", icon: CakeSlice },
  { value: "check_dropped" as const, label: "Check dropped", icon: ReceiptText },
  { value: "paid" as const, label: "Paid", icon: CircleDollarSign },
  { value: "complete" as const, label: "Complete", icon: CircleCheckBig },
  { value: "cancelled" as const, label: "Cancelled", icon: Ban },
  { value: "no_show" as const, label: "No-show", icon: UserX },
];
const SERVICE_STATUS_VALUES: Reservation["status"][] = ["seated", "entree", "dessert", "check_dropped", "paid", "complete"];

type GridData = {
  restaurant: { id: number; name: string };
  training_mode: boolean;
  data_mode: "training" | "production";
  service_date: string;
  current_service_date: string;
  booking_allowed: boolean;
  shifts: Shift[];
  selected_shift: Shift;
  tables: DiningTable[];
  reservations: Reservation[];
  blocks?: TableBlock[];
  summary: { reservations: number; covers: number; seated: number };
};

type BookingDraft = {
  tableIds: number[];
  tableNames: string[];
  capacity: number;
  time: string;
  durationMinutes: number;
};

type ReservationEditDraft = {
  partySize: string;
  durationMinutes: string;
  status: Reservation["status"];
  phone: string;
  reservationNotes: string;
  reservationTags: string[];
  guestNotes: string;
  guestTags: string[];
};

const SLOT_MINUTES = 15;
const SLOT_WIDTH = 74;
const TABLE_COLUMNS_WIDTH = 140;
const subscribeToHydration = () => () => undefined;

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
  initialConfirmationId?: number;
  initialServiceDate?: string;
  initialShiftSlug?: string;
  shouldSyncServiceUrl?: () => boolean;
};

export function ReservationGrid({
  initialConfirmationId,
  initialServiceDate,
  initialShiftSlug,
  shouldSyncServiceUrl,
}: ReservationGridProps) {
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const [selectedServiceDate, setServiceDate] = useState(initialServiceDate || "");
  const serviceDate = selectedServiceDate || (hydrated ? todayLocal() : "");
  const [shiftSlug, setShiftSlug] = useState(initialServiceDate ? initialShiftSlug || "" : "");
  const [data, setData] = useState<GridData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<BookingDraft | null>(null);
  const [selected, setSelected] = useState<Reservation | null>(null);
  const [reservationEditDraft, setReservationEditDraft] = useState<ReservationEditDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [draggedReservationId, setDraggedReservationId] = useState<number | null>(null);
  const [dropTargetTableId, setDropTargetTableId] = useState<number | null>(null);
  const [confirmationId, setConfirmationId] = useState(initialConfirmationId);
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [blockNotes, setBlockNotes] = useState("");
  const [blockScope, setBlockScope] = useState<"turn" | "shift">("turn");
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const reservationStatusMenuRef = useRef<HTMLDetailsElement>(null);
  const resolveCurrentService = useRef(!initialServiceDate);
  const gridRequestVersion = useRef(0);

  useLayoutEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  const syncServiceUrl = useCallback((
    nextServiceDate: string,
    nextShiftSlug: string,
    mode: "push" | "replace" = "push",
  ) => {
    if (pathnameRef.current !== "/reservations" || shouldSyncServiceUrl?.() === false) return;
    writeServiceUrl(nextServiceDate, nextShiftSlug, mode, appPath("/reservations"));
  }, [shouldSyncServiceUrl]);

  const loadGrid = useCallback(async () => {
    if (!serviceDate) return;
    const requestVersion = ++gridRequestVersion.current;
    setLoading(true);
    setError("");
    const query = new URLSearchParams({ date: serviceDate });
    if (shiftSlug) query.set("shift", shiftSlug);
    try {
      const response = await fetch(`${appPath("/api/grid")}?${query}`, { cache: "no-store" });
      const payload = (await response.json()) as GridData | Record<string, unknown>;
      if (requestVersion !== gridRequestVersion.current) return;
      if (!response.ok) throw new Error(readError(payload));
      const next = payload as GridData;
      if (resolveCurrentService.current) {
        resolveCurrentService.current = false;
        const closest = closestServiceOccurrence(next.shifts);
        const currentDate = next.current_service_date || closest?.date || todayLocal();
        const currentShift = closest?.shiftSlug || next.selected_shift.slug;
        syncServiceUrl(currentDate, currentShift, "replace");
        if (currentDate !== serviceDate || currentShift !== next.selected_shift.slug) {
          setServiceDate(currentDate);
          setShiftSlug(currentShift);
          return;
        }
      }
      setData(next);
      setShiftSlug(next.selected_shift.slug);
      syncServiceUrl(serviceDate, next.selected_shift.slug, "replace");
    } catch (reason) {
      if (requestVersion === gridRequestVersion.current) {
        setError(reason instanceof Error ? reason.message : "Unable to load the reservation grid.");
      }
    } finally {
      if (requestVersion === gridRequestVersion.current) setLoading(false);
    }
  }, [serviceDate, shiftSlug, syncServiceUrl]);

  useEffect(() => {
    // The grid is intentionally refreshed whenever the active service date or shift changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadGrid();
    return () => { gridRequestVersion.current += 1; };
  }, [loadGrid]);

  useEffect(() => {
    function restoreServiceFromUrl() {
      gridRequestVersion.current += 1;
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

  const confirmedReservation = useMemo(
    () => data?.reservations.find((reservation) => reservation.id === confirmationId) || null,
    [confirmationId, data],
  );

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
  const bookingAllowed = Boolean(
    data?.service_date === serviceDate && data.booking_allowed,
  );
  const serviceStatusAllowed = Boolean(
    data && data.service_date === serviceDate && serviceDate <= data.current_service_date,
  );
  const selectedStatusOption = RESERVATION_STATUS_OPTIONS.find(
    (option) => option.value === reservationEditDraft?.status,
  );
  const SelectedStatusIcon = selectedStatusOption?.icon;
  const visibleStatusOptions = serviceStatusAllowed
    ? RESERVATION_STATUS_OPTIONS
    : RESERVATION_STATUS_OPTIONS.filter((option) => !SERVICE_STATUS_VALUES.includes(option.value));

  function clearDraft() {
    setDraft(null);
  }

  function toggleDraftTable(table: DiningTable, time: string) {
    if (!data || !bookingAllowed) return;
    setSelected(null);
    setDraft((current) => {
      if (!current || current.time !== time) {
        return {
          tableIds: [table.id],
          tableNames: [table.name],
          capacity: table.capacity,
          time,
          durationMinutes: data.selected_shift.default_turn_minutes,
        };
      }
      if (current.tableIds.includes(table.id)) {
        const tableIndex = current.tableIds.indexOf(table.id);
        const tableIds = current.tableIds.filter((id) => id !== table.id);
        if (!tableIds.length) return null;
        return {
          ...current,
          tableIds,
          tableNames: current.tableNames.filter((_, index) => index !== tableIndex),
          capacity: current.capacity - table.capacity,
        };
      }
      return {
        ...current,
        tableIds: [...current.tableIds, table.id],
        tableNames: [...current.tableNames, table.name],
        capacity: current.capacity + table.capacity,
      };
    });
  }

  function chooseDate(next: string) {
    gridRequestVersion.current += 1;
    clearDraft();
    setSelected(null);
    syncServiceUrl(next, shiftSlug || data?.selected_shift.slug || "dinner");
    setServiceDate(next);
  }

  function chooseShift(next: string) {
    gridRequestVersion.current += 1;
    clearDraft();
    setSelected(null);
    syncServiceUrl(serviceDate, next);
    setShiftSlug(next);
  }

  function returnToNow() {
    gridRequestVersion.current += 1;
    clearDraft();
    setSelected(null);
    const closest = closestServiceOccurrence(data?.shifts || []);
    const currentDate = data?.current_service_date || closest?.date || todayLocal();
    const currentShift = closest?.shiftSlug || data?.selected_shift.slug || shiftSlug || "dinner";
    syncServiceUrl(currentDate, currentShift);
    setServiceDate(currentDate);
    setShiftSlug(currentShift);
  }

  function continueDraftInBookingFlow() {
    if (!draft || !data) return;
    const query = new URLSearchParams({
      date: serviceDate,
      shift: data.selected_shift.slug,
      time: draft.time,
      party_size: String(draft.capacity),
      duration: String(draft.durationMinutes),
      tables: draft.tableIds.join(","),
    });
    router.push(`/reservations/book?${query}`);
  }

  async function createBlock() {
    if (!data || !draft) return;
    setSaving(true);
    setError("");
    try {
      const remainingMinutes = minutes(data.selected_shift.end_time) - minutes(draft.time);
      const durationMinutes = blockScope === "shift"
        ? remainingMinutes
        : Math.min(draft.durationMinutes, remainingMinutes);
      const response = await fetch(appPath("/api/grid/blocks"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ service_date: serviceDate, shift_slug: data.selected_shift.slug, table_ids: draft.tableIds, start_time: draft.time, duration_minutes: durationMinutes, notes: blockNotes.trim() }),
      });
      const payload = await response.json() as TableBlock | Record<string, unknown>;
      if (!response.ok) throw new Error(readError(payload));
      setData((current) => current ? { ...current, blocks: [...(current.blocks || []), payload as TableBlock] } : current);
      setBlockDialogOpen(false);
      setBlockNotes("");
      clearDraft();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to block these tables.");
    } finally {
      setSaving(false);
    }
  }

  function toggleReservationEditTag(field: "reservationTags" | "guestTags", tag: string) {
    setReservationEditDraft((current) => {
      if (!current) return current;
      const tags = current[field];
      return {
        ...current,
        [field]: tags.includes(tag) ? tags.filter((item) => item !== tag) : [...tags, tag],
      };
    });
  }

  function changeTurnTime(delta: number) {
    setReservationEditDraft((current) => {
      if (!current) return current;
      const durationMinutes = Math.min(360, Math.max(15, Number(current.durationMinutes) + delta));
      return { ...current, durationMinutes: String(durationMinutes) };
    });
  }

  async function saveReservationDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !reservationEditDraft) return;
    const partySize = Number(reservationEditDraft.partySize);
    const durationMinutes = Number(reservationEditDraft.durationMinutes);
    if (!Number.isInteger(partySize) || partySize < 1 || partySize > 40) {
      setError("Enter a party size from 1 to 40.");
      return;
    }
    if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 360) {
      setError("Expected turn time must be between 15 minutes and 6 hours.");
      return;
    }
    if (!serviceStatusAllowed && SERVICE_STATUS_VALUES.includes(reservationEditDraft.status)) {
      setError("Reservations cannot be seated or marked as served on future dates.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch(appPath(`/api/grid/reservations/${selected.id}`), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          party_size: partySize,
          duration_minutes: durationMinutes,
          status: reservationEditDraft.status,
          guest_phone: reservationEditDraft.phone.trim(),
          notes: reservationEditDraft.reservationNotes.trim(),
          tags: reservationEditDraft.reservationTags,
          guest_notes: reservationEditDraft.guestNotes.trim(),
          guest_tags: reservationEditDraft.guestTags,
        }),
      });
      const payload = (await response.json()) as Reservation | Record<string, unknown>;
      if (!response.ok) throw new Error(readError(payload));
      await loadGrid();
      setSelected(null);
      setReservationEditDraft(null);
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
      if (selected?.id === reservation.id) setSelected(payload as Reservation);
      await loadGrid();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to move the reservation.");
    } finally {
      setSaving(false);
    }
  }

  function beginReservationDrag(event: DragEvent<HTMLButtonElement>, reservation: Reservation) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(reservation.id));
    clearDraft();
    setSelected(null);
    setDraggedReservationId(reservation.id);
  }

  async function openReservation(reservation: Reservation) {
    clearDraft();
    setSelected(reservation);
    setReservationEditDraft({
      partySize: String(reservation.party_size),
      durationMinutes: String(reservation.duration_minutes),
      status: reservation.status,
      phone: reservation.guest_phone || "",
      reservationNotes: reservation.notes || "",
      reservationTags: reservation.tags || [],
      guestNotes: reservation.guest_profile_notes || reservation.guest_notes || "",
      guestTags: reservation.guest_tags || [],
    });
  }

  return (
    <div className="reservation-page">
      <section className="grid-toolbar" aria-label="Reservation grid controls">
        <div className="toolbar-leading">
          {data?.training_mode && <span className="training-mode-indicator">Training mode</span>}
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
          <button type="button" disabled={!serviceDate} onClick={() => chooseDate(moveServiceDate(serviceDate, -1))} aria-label="Previous day">
            <ChevronLeft aria-hidden="true" />
          </button>
          <ServiceDatePicker value={serviceDate} onChange={chooseDate} />
          <button type="button" disabled={!serviceDate} onClick={() => chooseDate(moveServiceDate(serviceDate, 1))} aria-label="Next day">
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

      {data && !bookingAllowed && (
        <div className="grid-read-only-notice" role="status">
          <CalendarX2 aria-hidden="true" />
          <span><strong>Past service · view only</strong> New reservations cannot be added to a previous day.</span>
        </div>
      )}

      <div className="grid-and-panel">
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
                  const tableBlocks = (data.blocks || []).filter((item) => item.table_ids.includes(table.id));
                  const isOriginalTable = draggedReservation?.table_id === table.id;
                  const isSuggested = Boolean(
                    draggedReservation &&
                    !isOriginalTable &&
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
                            onClick={() => toggleDraftTable(table, slot)}
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
                                {reservation.party_size} guests · {formatTurnTime(reservation.duration_minutes)} turn
                                {warnings.length ? ` · ${warnings.join(" · ")}` : ""}
                              </small>
                            </button>
                          );
                        })}
                        {tableBlocks.map((block) => {
                          const offset = (minutes(block.start_time) - minutes(data.selected_shift.start_time)) / SLOT_MINUTES;
                          const width = (block.duration_minutes / SLOT_MINUTES) * SLOT_WIDTH;
                          return <div key={`block-${block.id}`} className="table-time-block" style={{ left: offset * SLOT_WIDTH + 2, width: width - 4 }} title={block.notes || "Table block"}>
                            <Ban aria-hidden="true" /><span>Blocked</span>{block.notes && <small>{block.notes}</small>}
                          </div>;
                        })}
                        {draft?.tableIds.includes(table.id) && (
                          <div
                            className="grid-hold-block"
                            style={{
                              left: ((minutes(draft.time) - minutes(data.selected_shift.start_time)) / SLOT_MINUTES) * SLOT_WIDTH + 2,
                              width: (draft.durationMinutes / SLOT_MINUTES) * SLOT_WIDTH - 4,
                            }}
                            aria-hidden="true"
                          >
                            <span>New reservation</span>
                            <small>{formatTurnTime(draft.durationMinutes)} hold</small>
                          </div>
                        )}
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

        {selected && reservationEditDraft && (
          <div className="reservation-editor-backdrop" role="presentation" onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) {
              setSelected(null);
              setReservationEditDraft(null);
            }
          }}>
            <form className="reservation-editor-dialog" onSubmit={saveReservationDetails} role="dialog" aria-modal="true" aria-labelledby="reservation-editor-title">
              <header>
                <div>
                  <p>Reservation details</p>
                  <h2 id="reservation-editor-title">{selected.guest_name}</h2>
                  <span><Clock3 aria-hidden="true" /> {displayTime(selected.start_time)} · {selected.table_names.length > 1 ? "Tables" : "Table"} {(selected.table_names.length ? selected.table_names : [selected.table_name]).join(" + ")}</span>
                </div>
                <button type="button" className="reservation-editor-close" onClick={() => { setSelected(null); setReservationEditDraft(null); }} disabled={saving} aria-label="Close reservation editor"><X aria-hidden="true" /></button>
              </header>
              <div className="reservation-editor-body">
                <div className="reservation-editor-fields">
                  <label>Party size<input type="number" min={1} max={40} inputMode="numeric" value={reservationEditDraft.partySize} onChange={(event) => { const partySize = event.currentTarget.value; setReservationEditDraft((current) => current && ({ ...current, partySize })); }} required /></label>
                  <div className="reservation-editor-status-field">
                    <span>Status</span>
                    <details ref={reservationStatusMenuRef} className="reservation-editor-status-menu">
                      <summary role="button" aria-label="Status" aria-disabled={saving} onClick={(event) => { if (saving) event.preventDefault(); }}>
                        {SelectedStatusIcon && <SelectedStatusIcon aria-hidden="true" />}
                        <strong>{selectedStatusOption?.label || reservationEditDraft.status}</strong>
                        <ChevronDown aria-hidden="true" />
                      </summary>
                      <div role="listbox" aria-label="Reservation status options">
                        {visibleStatusOptions.map((option) => {
                          const StatusIcon = option.icon;
                          const active = option.value === reservationEditDraft.status;
                          return (
                            <button type="button" role="option" aria-selected={active} key={option.value} onClick={() => {
                              setReservationEditDraft((current) => current && ({ ...current, status: option.value }));
                              reservationStatusMenuRef.current?.removeAttribute("open");
                            }}>
                              <StatusIcon aria-hidden="true" />
                              <span>{option.label}</span>
                              {active && <Check aria-hidden="true" />}
                            </button>
                          );
                        })}
                      </div>
                    </details>
                  </div>
                  <div className="reservation-editor-turn"><span>Turn time</span><div><button type="button" aria-label="Decrease turn time" onClick={() => changeTurnTime(-15)} disabled={saving || Number(reservationEditDraft.durationMinutes) <= 15}><Minus aria-hidden="true" /></button><output aria-label="Turn time">{formatTurnTime(Number(reservationEditDraft.durationMinutes))}</output><button type="button" aria-label="Increase turn time" onClick={() => changeTurnTime(15)} disabled={saving || Number(reservationEditDraft.durationMinutes) >= 360}><Plus aria-hidden="true" /></button></div></div>
                  <label>Phone number<PhoneInput value={reservationEditDraft.phone} onChange={(phone) => setReservationEditDraft((current) => current && ({ ...current, phone }))} /></label>
                </div>
                <section className="reservation-editor-section reservation-detail-section"><div className="booking-detail-section-heading"><TagIcon tag="Birthday" /><div><h3>This reservation</h3><p>Saved only for this visit.</p></div></div><fieldset className="tag-picker"><legend>Reservation tags</legend><div className="tag-options">{[...RESERVATION_TAGS, ...reservationEditDraft.reservationTags.filter((tag) => !RESERVATION_TAGS.includes(tag))].map((tag) => { const active = reservationEditDraft.reservationTags.includes(tag); return <button type="button" key={tag} className={active ? "selected" : ""} aria-pressed={active} onClick={() => toggleReservationEditTag("reservationTags", tag)}><TagIcon tag={tag} /><span>{tag}</span><Check className={active ? "tag-selected-check" : "tag-selected-check tag-check-placeholder"} aria-hidden="true" /></button>; })}</div></fieldset><label>Reservation notes<textarea {...IGNORE_AUTOFILL} rows={3} value={reservationEditDraft.reservationNotes} onChange={(event) => { const reservationNotes = event.currentTarget.value; setReservationEditDraft((current) => current && ({ ...current, reservationNotes })); }} maxLength={5000} placeholder="Occasion, seating request, accessibility…" /></label></section>
                <section className="reservation-editor-section guest-detail-section"><div className="booking-detail-section-heading"><Users aria-hidden="true" /><div><h3>Guest profile</h3><p>Persists for this guest on future visits.</p></div></div><fieldset className="tag-picker"><legend>Guest tags</legend><div className="tag-options">{[...GUEST_TAGS, ...reservationEditDraft.guestTags.filter((tag) => !GUEST_TAGS.includes(tag))].map((tag) => { const active = reservationEditDraft.guestTags.includes(tag); return <button type="button" key={tag} className={active ? "selected" : ""} aria-pressed={active} onClick={() => toggleReservationEditTag("guestTags", tag)}><TagIcon tag={tag} /><span>{tag}</span><Check className={active ? "tag-selected-check" : "tag-selected-check tag-check-placeholder"} aria-hidden="true" /></button>; })}</div></fieldset><label>Guest notes<textarea {...IGNORE_AUTOFILL} rows={3} value={reservationEditDraft.guestNotes} onChange={(event) => { const guestNotes = event.currentTarget.value; setReservationEditDraft((current) => current && ({ ...current, guestNotes })); }} maxLength={5000} placeholder="Preferences to remember for future visits…" /></label></section>
              </div>
              <footer><button type="button" onClick={() => { setSelected(null); setReservationEditDraft(null); }} disabled={saving}>Cancel</button><button type="submit" disabled={saving}>{saving ? "Saving…" : "Save changes"}</button></footer>
            </form>
          </div>
        )}
      </div>

      <section
        className={`grid-draft-bar ${draft ? "" : "is-empty"}`}
        aria-label="New reservation selection"
      >
        {draft && (
          <>
            <div>
              <p>New reservation selection</p>
              <strong>{draft.tableNames.length > 1 ? "Tables" : "Table"} {draft.tableNames.join(" + ")}</strong>
              <span>{displayTime(draft.time)} · {formatTurnTime(draft.durationMinutes)} hold · seats {draft.capacity}</span>
            </div>
            <div className="grid-draft-actions">
              <button className="secondary-action" type="button" onClick={clearDraft}>Clear</button>
              <button className="secondary-action" type="button" onClick={() => { setBlockScope("turn"); setBlockDialogOpen(true); }}>Block Tables</button>
              <button className="primary-action" type="button" onClick={continueDraftInBookingFlow}>Book Reservation</button>
            </div>
          </>
        )}
      </section>

      {blockDialogOpen && draft && data && (
        <div className="reservation-confirmation-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setBlockDialogOpen(false)}>
          <form className="reservation-confirmation-dialog table-block-dialog" onSubmit={(event) => { event.preventDefault(); void createBlock(); }} aria-labelledby="table-block-title">
            <button className="reservation-confirmation-close" type="button" onClick={() => setBlockDialogOpen(false)} aria-label="Close table block"><X aria-hidden="true" /></button>
            <p className="reservation-confirmation-eyebrow">Table block</p>
            <h2 id="table-block-title">Block {draft.tableNames.length > 1 ? "tables" : "table"} {draft.tableNames.join(" + ")}</h2>
            <p className="reservation-confirmation-readback">Starting {displayTime(draft.time)} during {data.selected_shift.name}.</p>
            <fieldset className="table-block-scope"><legend>How long?</legend>
              <label><input type="radio" name="block-scope" checked={blockScope === "turn"} onChange={() => setBlockScope("turn")} /> Next turn · {formatTurnTime(draft.durationMinutes)}</label>
              <label><input type="radio" name="block-scope" checked={blockScope === "shift"} onChange={() => setBlockScope("shift")} /> Rest of shift · until {displayTime(data.selected_shift.end_time)}</label>
            </fieldset>
            <label className="table-block-notes">Block notes<textarea value={blockNotes} onChange={(event) => setBlockNotes(event.target.value)} maxLength={5000} placeholder="Why are these tables blocked?" /></label>
            <footer><button className="reservation-confirmation-done" type="submit" disabled={saving}>{saving ? "Blocking…" : "Confirm block"}</button></footer>
          </form>
        </div>
      )}

      {confirmedReservation && data && (
        <div
          className="reservation-confirmation-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setConfirmationId(undefined);
          }}
        >
          <section
            className="reservation-confirmation-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reservation-confirmation-title"
          >
            <button
              type="button"
              className="reservation-confirmation-close"
              onClick={() => setConfirmationId(undefined)}
              aria-label="Close reservation confirmation"
            >
              <X aria-hidden="true" />
            </button>
            <CircleCheck className="reservation-confirmation-icon" aria-hidden="true" />
            <p className="reservation-confirmation-eyebrow">Reservation booked</p>
            <h2 id="reservation-confirmation-title">Read this back to the guest</h2>
            <p className="reservation-confirmation-readback">
              {confirmedReservation.guest_name} is confirmed for {confirmedReservation.party_size} {confirmedReservation.party_size === 1 ? "guest" : "guests"} on {displayServiceDate(data.service_date)} at {displayTime(confirmedReservation.start_time)}.
            </p>
            <dl className="reservation-confirmation-details">
              <div><dt>Service</dt><dd>{data.selected_shift.name}</dd></div>
              <div><dt>Turn time</dt><dd>{formatTurnTime(confirmedReservation.duration_minutes)}</dd></div>
              <div>
                <dt>Table</dt>
                <dd>{confirmedReservation.is_unassigned ? "To be assigned" : `${confirmedReservation.table_names.length > 1 ? "Tables" : "Table"} ${(confirmedReservation.table_names.length ? confirmedReservation.table_names : [confirmedReservation.table_name]).join(" + ")}`}</dd>
              </div>
            </dl>
            {confirmedReservation.is_unassigned && (
              <p className="reservation-confirmation-note">The reservation is confirmed and will be assigned to a table later.</p>
            )}
            <footer>
              <button type="button" className="reservation-confirmation-email" disabled title="Confirmation emails are coming soon">
                <Mail aria-hidden="true" /> Send confirmation email <span>Coming soon</span>
              </button>
              <button type="button" className="reservation-confirmation-done" onClick={() => setConfirmationId(undefined)}>Done</button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}

function displayServiceDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(year, month - 1, day));
}
