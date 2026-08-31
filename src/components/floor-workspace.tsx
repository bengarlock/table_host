"use client";

import {
  AlignHorizontalSpaceAround,
  Check,
  ChevronLeft,
  ChevronRight,
  CirclePlus,
  Clock3,
  GripVertical,
  LoaderCircle,
  PencilRuler,
  Plus,
  RotateCcw,
  RotateCw,
  Rows3,
  Save,
  Search,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import {
  CSSProperties,
  DragEvent,
  FormEvent,
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { ServiceDatePicker } from "@/components/service-date-picker";
import { appPath } from "@/lib/app-paths";
import {
  closestServiceOccurrence,
  localDateValue,
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
  width: number;
  height: number;
  rotation: number;
  chair_layout: "wrap" | "across";
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

function displayTime(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function chairPositions(table: DiningTable): CSSProperties[] {
  const sides = table.chair_layout === "across"
    ? Array.from({ length: table.capacity }, (_, index) => index % 2 === 0 ? 0 : 2)
    : Array.from({ length: table.capacity }, (_, index) => index % 4);
  const totals = sides.reduce((counts, side) => {
    counts[side] += 1;
    return counts;
  }, [0, 0, 0, 0]);
  const placed = [0, 0, 0, 0];

  return sides.map((side) => {
    placed[side] += 1;
    const offset = `${(placed[side] / (totals[side] + 1)) * 100}%`;
    if (side === 0) return { left: offset, top: 0, transform: "translate(-50%, -50%)" };
    if (side === 1) return { left: "100%", top: offset, transform: "translate(-50%, -50%) rotate(90deg)" };
    if (side === 2) return { left: offset, top: "100%", transform: "translate(-50%, -50%) rotate(180deg)" };
    return { left: 0, top: offset, transform: "translate(-50%, -50%) rotate(270deg)" };
  });
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

type FloorWorkspaceProps = {
  initialServiceDate?: string;
  initialShiftSlug?: string;
};

type FloorTableDrag = {
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
  origins: Array<{ id: number; positionX: number; positionY: number }>;
};

export function FloorWorkspace({ initialServiceDate, initialShiftSlug }: FloorWorkspaceProps) {
  const [serviceDate, setServiceDate] = useState(initialServiceDate || todayLocal);
  const [shiftSlug, setShiftSlug] = useState(initialServiceDate ? initialShiftSlug || "" : "");
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
  const [editingFloor, setEditingFloor] = useState(false);
  const [editedTables, setEditedTables] = useState<DiningTable[]>([]);
  const [editorSelectedTableIds, setEditorSelectedTableIds] = useState<number[]>([]);
  const [movingEditorTables, setMovingEditorTables] = useState(false);
  const resolveCurrentService = useRef(!initialServiceDate);
  const floorCanvasRef = useRef<HTMLDivElement>(null);
  const floorTableDragRef = useRef<FloorTableDrag | null>(null);
  const suppressEditorClickRef = useRef(false);

  const loadFloor = useCallback(async () => {
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
        const currentDate = closest?.date || todayLocal();
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
  const displayedTables = editingFloor ? editedTables : data?.tables || [];
  const editorSelectedTables = useMemo(
    () => editedTables.filter((table) => editorSelectedTableIds.includes(table.id)),
    [editedTables, editorSelectedTableIds],
  );
  const editorValues = useMemo(() => {
    const first = editorSelectedTables[0];
    if (!first) return null;
    const shared = <Key extends keyof DiningTable,>(key: Key) =>
      editorSelectedTables.every((table) => table[key] === first[key]) ? first[key] : "";
    return {
      capacity: shared("capacity"),
      shape: shared("shape"),
      width: shared("width"),
      height: shared("height"),
      rotation: shared("rotation"),
      chairLayout: shared("chair_layout"),
    };
  }, [editorSelectedTables]);

  function cancelSeating() {
    setSeatingMode(null);
    setSelectedTableIds([]);
    setWalkInDraft(null);
  }

  function beginFloorEditing() {
    if (!data) return;
    cancelSeating();
    setFocusedReservationId(null);
    setSelectedPendingId(null);
    setEditedTables(data.tables.map((table) => ({ ...table })));
    setEditorSelectedTableIds([]);
    setEditingFloor(true);
  }

  function cancelFloorEditing() {
    setEditingFloor(false);
    setEditedTables([]);
    setEditorSelectedTableIds([]);
    setMovingEditorTables(false);
    floorTableDragRef.current = null;
  }

  function updateEditorSelection(patch: Partial<DiningTable>) {
    if (!editorSelectedTableIds.length) return;
    setEditedTables((current) => current.map((table) =>
      editorSelectedTableIds.includes(table.id) ? { ...table, ...patch } : table,
    ));
  }

  function alignSelectedTables() {
    if (editorSelectedTables.length < 2) return;
    const row = Math.round(
      editorSelectedTables.reduce((total, table) => total + table.position_y, 0)
      / editorSelectedTables.length,
    );
    updateEditorSelection({ position_y: row });
  }

  function spaceSelectedTables() {
    if (editorSelectedTables.length < 2) return;
    const ordered = [...editorSelectedTables].sort((left, right) => left.position_x - right.position_x);
    const first = ordered[0].position_x;
    const last = ordered.at(-1)?.position_x || first;
    const gap = ordered.length > 1 ? (last - first) / (ordered.length - 1) : 0;
    const positions = new Map(ordered.map((table, index) => [table.id, Math.round(first + gap * index)]));
    setEditedTables((current) => current.map((table) =>
      positions.has(table.id) ? { ...table, position_x: positions.get(table.id) as number } : table,
    ));
  }

  function rotateSelectedTables(amount: number) {
    if (!editorSelectedTableIds.length) return;
    setEditedTables((current) => current.map((table) => editorSelectedTableIds.includes(table.id)
      ? { ...table, rotation: (table.rotation + amount + 360) % 360 }
      : table));
  }

  function beginTableMove(event: ReactPointerEvent<HTMLButtonElement>, tableId: number) {
    if (!editingFloor || event.button !== 0) return;
    if ((event.shiftKey || event.metaKey) && !editorSelectedTableIds.includes(tableId)) {
      return;
    }
    const selectedIds = editorSelectedTableIds.includes(tableId)
      ? editorSelectedTableIds
      : [tableId];
    setEditorSelectedTableIds(selectedIds);
    floorTableDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      origins: editedTables
        .filter((table) => selectedIds.includes(table.id))
        .map((table) => ({
          id: table.id,
          positionX: table.position_x,
          positionY: table.position_y,
        })),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveSelectedTables(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = floorTableDragRef.current;
    const canvas = floorCanvasRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !canvas) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(deltaX, deltaY) > 3) {
      drag.moved = true;
      setMovingEditorTables(true);
    }
    if (!drag.moved) return;
    const xPercent = (deltaX / canvas.clientWidth) * 100;
    const yPercent = (deltaY / canvas.clientHeight) * 100;
    const origins = new Map(drag.origins.map((origin) => [origin.id, origin]));
    setEditedTables((current) => current.map((table) => {
      const origin = origins.get(table.id);
      return origin ? {
        ...table,
        position_x: Math.round(clamp(origin.positionX + xPercent, 3, 97)),
        position_y: Math.round(clamp(origin.positionY + yPercent, 4, 96)),
      } : table;
    }));
  }

  function finishTableMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = floorTableDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    suppressEditorClickRef.current = drag.moved;
    floorTableDragRef.current = null;
    setMovingEditorTables(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function selectEditorTable(tableId: number, additive: boolean) {
    if (suppressEditorClickRef.current) {
      suppressEditorClickRef.current = false;
      return;
    }
    setEditorSelectedTableIds((current) => {
      if (!additive) return [tableId];
      return current.includes(tableId)
        ? current.filter((selectedId) => selectedId !== tableId)
        : [...current, tableId];
    });
  }

  async function saveFloorLayout() {
    if (!editedTables.length) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(appPath("/api/grid/tables"), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tables: editedTables.map((table) => ({
            id: table.id,
            capacity: table.capacity,
            shape: table.shape,
            position_x: table.position_x,
            position_y: table.position_y,
            width: table.width,
            height: table.height,
            rotation: table.rotation,
            chair_layout: table.chair_layout,
          })),
        }),
      });
      const payload = (await response.json()) as DiningTable[] | Record<string, unknown>;
      if (!response.ok) throw new Error(readError(payload));
      cancelFloorEditing();
      await loadFloor();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save the floor layout.");
    } finally {
      setSaving(false);
    }
  }

  function chooseDate(value: string) {
    if (editingFloor) return;
    cancelSeating();
    setSelectedPendingId(null);
    setFocusedReservationId(null);
    writeServiceUrl(value, shiftSlug || data?.selected_shift.slug || "dinner");
    setServiceDate(value);
  }

  function chooseShift(value: string) {
    if (editingFloor) return;
    cancelSeating();
    setSelectedPendingId(null);
    setFocusedReservationId(null);
    writeServiceUrl(serviceDate, value);
    setShiftSlug(value);
  }

  function jumpToNow() {
    if (editingFloor) return;
    cancelSeating();
    setSelectedPendingId(null);
    setFocusedReservationId(null);
    const now = new Date();
    const closest = closestServiceOccurrence(data?.shifts || [], now);
    const currentDate = closest?.date || localDateValue(now);
    const currentShift = closest?.shiftSlug || data?.selected_shift.slug || shiftSlug || "dinner";
    writeServiceUrl(currentDate, currentShift);
    setServiceDate(currentDate);
    setShiftSlug(currentShift);
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
              <button type="button" onClick={() => chooseDate(moveServiceDate(serviceDate, -1))} aria-label="Previous day">
                <ChevronLeft aria-hidden="true" />
              </button>
              <ServiceDatePicker value={serviceDate} onChange={chooseDate} />
              <button type="button" onClick={() => chooseDate(moveServiceDate(serviceDate, 1))} aria-label="Next day">
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

          <div className={`floor-service-layout${editingFloor ? " editing-floor" : ""}`}>
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
                  <button type="button" onClick={() => setAddTableOpen(true)} disabled={saving || editingFloor}>
                    <Plus aria-hidden="true" /> Add Table
                  </button>
                  <button
                    type="button"
                    className="floor-edit-trigger"
                    onClick={beginFloorEditing}
                    disabled={saving || editingFloor || !data?.tables.length}
                  >
                    <PencilRuler aria-hidden="true" /> {editingFloor ? "Editing Floor" : "Edit Floor"}
                  </button>
                </div>
              </div>

              {editingFloor && (
                <section className="floor-editor-console" aria-label="Floor editor console">
                  <div className="floor-editor-selection">
                    <span>Floor editor</span>
                    <strong>{editorSelectedTableIds.length || "No"} table{editorSelectedTableIds.length === 1 ? "" : "s"} selected</strong>
                    <small>Click a table to select it. Shift-click adds more; drag any selected table to move the group.</small>
                    <div>
                      <button type="button" onClick={() => setEditorSelectedTableIds(editedTables.map((table) => table.id))}>
                        Select all
                      </button>
                      <button type="button" onClick={() => setEditorSelectedTableIds([])} disabled={!editorSelectedTableIds.length}>
                        Clear
                      </button>
                    </div>
                  </div>
                  <div className="floor-editor-tools">
                    <div className="floor-editor-tool-group" aria-label="Alignment tools">
                      <span>Arrange</span>
                      <button type="button" onClick={alignSelectedTables} disabled={editorSelectedTables.length < 2}>
                        <Rows3 aria-hidden="true" /> Align row
                      </button>
                      <button type="button" onClick={spaceSelectedTables} disabled={editorSelectedTables.length < 2}>
                        <AlignHorizontalSpaceAround aria-hidden="true" /> Equal spacing
                      </button>
                    </div>
                    <div className="floor-editor-tool-group" aria-label="Rotation tools">
                      <span>Rotate</span>
                      <button type="button" onClick={() => rotateSelectedTables(-15)} disabled={!editorSelectedTableIds.length} aria-label="Rotate selected tables left 15 degrees">
                        <RotateCcw aria-hidden="true" /> −15°
                      </button>
                      <button type="button" onClick={() => rotateSelectedTables(15)} disabled={!editorSelectedTableIds.length} aria-label="Rotate selected tables right 15 degrees">
                        <RotateCw aria-hidden="true" /> +15°
                      </button>
                    </div>
                    <div className="floor-editor-fields">
                      <label>
                        Seats
                        <input
                          type="number"
                          min={1}
                          max={40}
                          value={editorValues?.capacity ?? ""}
                          placeholder="Mixed"
                          disabled={!editorValues}
                          onChange={(event) => {
                            if (event.target.value) updateEditorSelection({ capacity: Number(event.target.value) });
                          }}
                          onBlur={(event) => updateEditorSelection({ capacity: clamp(Number(event.target.value), 1, 40) })}
                        />
                      </label>
                      <label>
                        Shape
                        <select
                          value={editorValues?.shape ?? ""}
                          disabled={!editorValues}
                          onChange={(event) => updateEditorSelection({ shape: event.target.value as DiningTable["shape"] })}
                        >
                          <option value="" disabled>Mixed</option>
                          <option value="rectangle">Rectangle</option>
                          <option value="round">Round</option>
                        </select>
                      </label>
                      <label>
                        Width
                        <input
                          type="number"
                          min={72}
                          max={220}
                          value={editorValues?.width ?? ""}
                          placeholder="Mixed"
                          disabled={!editorValues}
                          onChange={(event) => {
                            if (event.target.value) updateEditorSelection({ width: Number(event.target.value) });
                          }}
                          onBlur={(event) => updateEditorSelection({ width: clamp(Number(event.target.value), 72, 220) })}
                        />
                      </label>
                      <label>
                        Height
                        <input
                          type="number"
                          min={64}
                          max={180}
                          value={editorValues?.height ?? ""}
                          placeholder="Mixed"
                          disabled={!editorValues}
                          onChange={(event) => {
                            if (event.target.value) updateEditorSelection({ height: Number(event.target.value) });
                          }}
                          onBlur={(event) => updateEditorSelection({ height: clamp(Number(event.target.value), 64, 180) })}
                        />
                      </label>
                      <label>
                        Chairs
                        <select
                          value={editorValues?.chairLayout ?? ""}
                          disabled={!editorValues}
                          onChange={(event) => updateEditorSelection({ chair_layout: event.target.value as DiningTable["chair_layout"] })}
                        >
                          <option value="" disabled>Mixed</option>
                          <option value="wrap">Wrap around</option>
                          <option value="across">Across</option>
                        </select>
                      </label>
                    </div>
                  </div>
                  <div className="floor-editor-actions">
                    <button type="button" onClick={cancelFloorEditing} disabled={saving}>Cancel</button>
                    <button type="button" className="floor-editor-save" onClick={() => void saveFloorLayout()} disabled={saving}>
                      {saving ? <LoaderCircle className="spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
                      {saving ? "Saving…" : "Save Floor"}
                    </button>
                  </div>
                </section>
              )}

              <div
                ref={floorCanvasRef}
                className={`floor-canvas${seatingMode ? " assigning seating" : ""}${editingFloor ? " editing" : ""}${movingEditorTables ? " moving-tables" : ""}`}
                onPointerDown={(event) => {
                  if (editingFloor && event.target === event.currentTarget) setEditorSelectedTableIds([]);
                }}
              >
                {loading && !data ? (
                  <div className="floor-canvas-loading"><LoaderCircle className="spin" aria-hidden="true" /> Loading tables…</div>
                ) : displayedTables.map((table) => {
                  const reservation = activeByTable.get(table.id);
                  const available = !reservation;
                  const editorSelected = editorSelectedTableIds.includes(table.id);
                  return (
                    <button
                      type="button"
                      key={table.id}
                      className={`floor-table floor-table-${table.shape}${available ? " available" : ` occupied status-${reservation.status}`}${dropTargetTableId === table.id ? " drop-target" : ""}${selectedTableIds.includes(table.id) ? " seat-selected" : ""}${editorSelected ? " editor-selected" : ""}`}
                      style={{
                        left: `${table.position_x}%`,
                        top: `${table.position_y}%`,
                        width: `${table.width}px`,
                        height: `${table.height}px`,
                        "--table-rotation": `${table.rotation}deg`,
                      } as CSSProperties}
                      onClick={(event) => {
                        if (editingFloor) {
                          selectEditorTable(table.id, event.shiftKey || event.metaKey);
                        } else if (reservation) {
                          setFocusedReservationId(reservation.id);
                        } else if (seatingMode) {
                          toggleSeatingTable(table.id);
                        }
                      }}
                      onPointerDown={(event) => beginTableMove(event, table.id)}
                      onPointerMove={moveSelectedTables}
                      onPointerUp={finishTableMove}
                      onPointerCancel={finishTableMove}
                      onDragOver={(event) => {
                        if (editingFloor || !available || !draggedReservation || !liveService) return;
                        event.preventDefault();
                        setDropTargetTableId(table.id);
                      }}
                      onDragLeave={() => {
                        if (!editingFloor) setDropTargetTableId(null);
                      }}
                      onDrop={(event) => {
                        if (!editingFloor) dropReservation(event, table);
                      }}
                      aria-pressed={editingFloor ? editorSelected : seatingMode ? selectedTableIds.includes(table.id) : undefined}
                      aria-label={editingFloor
                        ? `Table ${table.name}, ${table.capacity} seats, ${table.shape}, ${editorSelected ? "selected" : "not selected"}`
                        : reservation
                          ? `Table ${table.name}, ${reservation.guest_name}, ${statusLabel(reservation.status)}`
                          : `Table ${table.name}, available, seats ${table.capacity}${selectedTableIds.includes(table.id) ? ", selected for seating" : ""}`}
                    >
                      {chairPositions(table).map((style, index) => (
                        <i key={index} className="chair" style={style} aria-hidden="true" />
                      ))}
                      <span className="floor-table-surface">
                        <strong>{table.name}</strong>
                        {reservation ? (
                          <>
                            <small>{reservation.guest_name}</small>
                            <em>{statusLabel(reservation.status)}</em>
                          </>
                        ) : (
                          <><small>{table.capacity} seats</small><em>{editingFloor ? `${table.rotation}°` : "Available"}</em></>
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
