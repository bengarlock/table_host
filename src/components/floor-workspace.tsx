"use client";

import {
  AlignHorizontalSpaceAround,
  Check,
  ChevronLeft,
  ChevronRight,
  CirclePlus,
  Clock3,
  CopyPlus,
  GripVertical,
  LoaderCircle,
  PencilRuler,
  RotateCcw,
  RotateCw,
  Rows3,
  Save,
  Search,
  Trash2,
  TriangleAlert,
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
  useSyncExternalStore,
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
  chair_layout: "wrap" | "across" | "across_horizontal";
  clone_source_id?: number;
  is_new?: boolean;
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
  table_id: number | null;
  table_name: string;
  table_ids: number[];
  table_names: string[];
  guest_name: string;
  party_size: number;
  start_time: string;
  duration_minutes: number;
  status: ServiceStatus;
  is_unassigned: boolean;
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
const subscribeToHydration = () => () => undefined;

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

function nextAvailableTableNumber(sourceName: string, usedNumbers: Set<number>) {
  const sourceNumber = /^\d+$/.test(sourceName.trim()) ? Number(sourceName) : 0;
  let candidate = sourceNumber + 1;
  while (usedNumbers.has(candidate)) candidate += 1;
  usedNumbers.add(candidate);
  return String(candidate);
}

function chairPositions(table: DiningTable): CSSProperties[] {
  if (table.shape === "round" && table.chair_layout === "wrap") {
    return Array.from({ length: table.capacity }, (_, index) => {
      const angle = -90 + (index * 360) / table.capacity;
      const radians = (angle * Math.PI) / 180;
      return {
        left: `${50 + Math.cos(radians) * 50}%`,
        top: `${50 + Math.sin(radians) * 50}%`,
        transform: `translate(-50%, -50%) rotate(${angle + 90}deg)`,
      };
    });
  }

  const sides = table.chair_layout === "across"
    ? Array.from({ length: table.capacity }, (_, index) => index % 2 === 0 ? 0 : 2)
    : table.chair_layout === "across_horizontal"
      ? Array.from({ length: table.capacity }, (_, index) => index % 2 === 0 ? 1 : 3)
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

type FloorMarqueeDrag = {
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
  initialSelectedIds: number[];
};

type FloorMarqueeBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
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
  const [deletedTableIds, setDeletedTableIds] = useState<number[]>([]);
  const [deleteConfirmationIds, setDeleteConfirmationIds] = useState<number[]>([]);
  const [movingEditorTables, setMovingEditorTables] = useState(false);
  const [floorMarqueeBounds, setFloorMarqueeBounds] = useState<FloorMarqueeBounds | null>(null);
  const resolveCurrentService = useRef(!initialServiceDate);
  const floorCanvasRef = useRef<HTMLDivElement>(null);
  const floorTableDragRef = useRef<FloorTableDrag | null>(null);
  const floorMarqueeDragRef = useRef<FloorMarqueeDrag | null>(null);
  const floorLoadRequestRef = useRef(0);
  const suppressEditorClickRef = useRef(false);

  const loadFloor = useCallback(async (signal?: AbortSignal) => {
    const requestId = ++floorLoadRequestRef.current;
    setLoading(true);
    setError("");
    const query = new URLSearchParams({ date: serviceDate });
    if (shiftSlug) query.set("shift", shiftSlug);
    try {
      const response = await fetch(`${appPath("/api/grid")}?${query}`, { cache: "no-store", signal });
      const payload = (await response.json()) as GridData | Record<string, unknown>;
      if (!response.ok) throw new Error(readError(payload));
      if (requestId !== floorLoadRequestRef.current) return;
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
      if (signal?.aborted || requestId !== floorLoadRequestRef.current) return;
      setError(reason instanceof Error ? reason.message : "Unable to load the floor plan.");
    } finally {
      if (!signal?.aborted && requestId === floorLoadRequestRef.current) setLoading(false);
    }
  }, [serviceDate, shiftSlug]);

  useEffect(() => {
    const controller = new AbortController();
    // Refresh the floor whenever the service date or shift changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadFloor(controller.signal);
    return () => controller.abort();
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

  const unassignedReservations = useMemo(
    () => data?.reservations.filter((reservation) => reservation.is_unassigned) || [],
    [data],
  );
  const pendingReservations = useMemo(
    () => data?.reservations.filter(
      (reservation) => reservation.status === "confirmed" || reservation.is_unassigned,
    ) || [],
    [data],
  );
  const activeReservations = useMemo(
    () => data?.reservations.filter(
      (reservation) => ACTIVE_STATUSES.includes(reservation.status) && !reservation.is_unassigned,
    ) || [],
    [data],
  );
  const activeByTable = useMemo(
    () => new Map(
      activeReservations.flatMap((reservation) =>
        (reservation.table_ids.length
          ? reservation.table_ids
          : reservation.table_id === null ? [] : [reservation.table_id]).map(
          (tableId) => [tableId, reservation] as const,
        ),
      ),
    ),
    [activeReservations],
  );
  const selectedPending = pendingReservations.find((item) => item.id === selectedPendingId) || null;
  const draggedReservation = pendingReservations.find((item) => item.id === draggedReservationId) || null;
  const focusedReservation = activeReservations.find((item) => item.id === focusedReservationId) || null;
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const liveService = hydrated && serviceDate === todayLocal();
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
  const deleteSelectionConfirmed = editorSelectedTableIds.length > 0
    && editorSelectedTableIds.length === deleteConfirmationIds.length
    && editorSelectedTableIds.every((id) => deleteConfirmationIds.includes(id));

  function cancelSeating() {
    setSeatingMode(null);
    setSelectedTableIds([]);
    setWalkInDraft(null);
  }

  function beginFloorEditing() {
    if (!data) return;
    setError("");
    cancelSeating();
    setFocusedReservationId(null);
    setSelectedPendingId(null);
    setEditedTables(data.tables.map((table) => ({ ...table })));
    setEditorSelectedTableIds([]);
    setDeletedTableIds([]);
    setDeleteConfirmationIds([]);
    setEditingFloor(true);
  }

  function cancelFloorEditing() {
    setError("");
    setEditingFloor(false);
    setEditedTables([]);
    setEditorSelectedTableIds([]);
    setDeletedTableIds([]);
    setDeleteConfirmationIds([]);
    setMovingEditorTables(false);
    setFloorMarqueeBounds(null);
    floorTableDragRef.current = null;
    floorMarqueeDragRef.current = null;
  }

  function allowPageNavigation() {
    if (!editingFloor) return true;
    setError("Save the floor layout before navigating to another page.");
    return false;
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

  function cloneSelectedTables() {
    if (!editorSelectedTables.length) return;
    const selected = [...editorSelectedTables].sort((left, right) =>
      left.sort_order - right.sort_order || left.id - right.id);
    const usedNumbers = new Set(
      editedTables
        .map((table) => table.name.trim())
        .filter((name) => /^\d+$/.test(name))
        .map(Number),
    );
    const minimumX = Math.min(...selected.map((table) => table.position_x));
    const maximumX = Math.max(...selected.map((table) => table.position_x));
    const minimumY = Math.min(...selected.map((table) => table.position_y));
    const maximumY = Math.max(...selected.map((table) => table.position_y));
    const horizontalShift = maximumX <= 82 ? 14 : minimumX >= 18 ? -14 : 0;
    const verticalShift = horizontalShift ? 0 : maximumY <= 82 ? 14 : minimumY >= 18 ? -14 : 0;
    let temporaryId = Math.min(0, ...editedTables.map((table) => table.id)) - 1;
    const nextSortOrder = Math.max(0, ...editedTables.map((table) => table.sort_order)) + 1;
    const clones = selected.map((table, index) => ({
      ...table,
      id: temporaryId--,
      name: nextAvailableTableNumber(table.name, usedNumbers),
      sort_order: nextSortOrder + index,
      position_x: clamp(table.position_x + horizontalShift, 0, 100),
      position_y: clamp(table.position_y + verticalShift, 0, 100),
      clone_source_id: table.is_new ? undefined : table.clone_source_id ?? table.id,
      is_new: table.is_new,
    }));
    setEditedTables((current) => [...current, ...clones]);
    setEditorSelectedTableIds(clones.map((table) => table.id));
  }

  function createStandardTwoTop() {
    const usedNumbers = new Set(
      editedTables
        .map((table) => table.name.trim())
        .filter((name) => /^\d+$/.test(name))
        .map(Number),
    );
    let number = 1;
    while (usedNumbers.has(number)) number += 1;

    const tableIndex = editedTables.length;
    const table: DiningTable = {
      id: Math.min(0, ...editedTables.map((item) => item.id)) - 1,
      name: String(number),
      capacity: 2,
      sort_order: Math.max(0, ...editedTables.map((item) => item.sort_order)) + 1,
      shape: "rectangle",
      position_x: 10 + (tableIndex % 4) * 25,
      position_y: 18 + (Math.floor(tableIndex / 4) % 3) * 34,
      width: 108,
      height: 76,
      rotation: 0,
      chair_layout: "across",
      is_new: true,
    };
    setEditedTables((current) => [...current, table]);
    setEditorSelectedTableIds([table.id]);
    setDeleteConfirmationIds([]);
  }

  function deleteSelectedTables() {
    if (!editorSelectedTableIds.length) return;
    if (!deleteSelectionConfirmed) {
      setDeleteConfirmationIds([...editorSelectedTableIds]);
      return;
    }
    const selectedIds = new Set(editorSelectedTableIds);
    setDeletedTableIds((current) => [
      ...new Set([
        ...current,
        ...editorSelectedTableIds.filter((id) => id > 0),
      ]),
    ]);
    setEditedTables((current) => current.filter((table) => !selectedIds.has(table.id)));
    setEditorSelectedTableIds([]);
    setDeleteConfirmationIds([]);
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

  function beginFloorMarquee(event: ReactPointerEvent<HTMLDivElement>) {
    if (!editingFloor || event.button !== 0 || event.target !== event.currentTarget) return;
    const canvasBounds = event.currentTarget.getBoundingClientRect();
    const additive = event.shiftKey || event.metaKey;
    floorMarqueeDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX - canvasBounds.left,
      startY: event.clientY - canvasBounds.top,
      moved: false,
      initialSelectedIds: additive ? editorSelectedTableIds : [],
    };
    if (!additive) setEditorSelectedTableIds([]);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function updateFloorMarquee(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = floorMarqueeDragRef.current;
    const canvas = floorCanvasRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !canvas) return;
    const canvasBounds = canvas.getBoundingClientRect();
    const currentX = clamp(event.clientX - canvasBounds.left, 0, canvas.clientWidth);
    const currentY = clamp(event.clientY - canvasBounds.top, 0, canvas.clientHeight);
    if (!drag.moved && Math.hypot(currentX - drag.startX, currentY - drag.startY) <= 4) return;
    drag.moved = true;
    const bounds = {
      left: Math.min(drag.startX, currentX),
      top: Math.min(drag.startY, currentY),
      width: Math.abs(currentX - drag.startX),
      height: Math.abs(currentY - drag.startY),
    };
    setFloorMarqueeBounds(bounds);

    const marqueeRight = canvasBounds.left + bounds.left + bounds.width;
    const marqueeBottom = canvasBounds.top + bounds.top + bounds.height;
    const marqueeLeft = canvasBounds.left + bounds.left;
    const marqueeTop = canvasBounds.top + bounds.top;
    const intersectedIds = Array.from(canvas.querySelectorAll<HTMLElement>("[data-floor-table-id]"))
      .filter((table) => {
        const tableBounds = table.getBoundingClientRect();
        return tableBounds.right >= marqueeLeft
          && tableBounds.left <= marqueeRight
          && tableBounds.bottom >= marqueeTop
          && tableBounds.top <= marqueeBottom;
      })
      .map((table) => Number(table.dataset.floorTableId));
    setEditorSelectedTableIds([...new Set([...drag.initialSelectedIds, ...intersectedIds])]);
  }

  function finishFloorMarquee(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = floorMarqueeDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    floorMarqueeDragRef.current = null;
    setFloorMarqueeBounds(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  async function saveFloorLayout() {
    if (!editedTables.length && !deletedTableIds.length) {
      cancelFloorEditing();
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch(appPath("/api/grid/tables"), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tables: editedTables.filter((table) => table.id > 0).map((table) => ({
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
          creations: editedTables.filter((table) => table.id < 0 && table.is_new).map((table) => ({
            name: table.name,
            capacity: table.capacity,
            shape: table.shape,
            position_x: table.position_x,
            position_y: table.position_y,
            width: table.width,
            height: table.height,
            rotation: table.rotation,
            chair_layout: table.chair_layout,
          })),
          clones: editedTables.filter((table) => table.id < 0 && !table.is_new).map((table) => ({
            source_id: table.clone_source_id,
            capacity: table.capacity,
            shape: table.shape,
            position_x: table.position_x,
            position_y: table.position_y,
            width: table.width,
            height: table.height,
            rotation: table.rotation,
            chair_layout: table.chair_layout,
          })),
          deletions: deletedTableIds.map((id) => ({ id })),
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
    void updateReservation(reservation, {
      table_ids: [table.id],
      status: reservation.status === "confirmed" ? "seated" : reservation.status,
    });
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
        selectedPending.table_ids.length
          ? selectedPending.table_ids
          : selectedPending.table_id === null ? [] : [selectedPending.table_id],
      );
      return;
    }
    if (!selectedTableIds.length) return;

    if (seatingMode === "reservation" && selectedPending) {
      const completed = await updateReservation(selectedPending, {
        table_ids: selectedTableIds,
        status: selectedPending.status === "confirmed" ? "seated" : selectedPending.status,
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

  return (
    <div className="app-shell">
      <AppSidebar onNavigateAttempt={allowPageNavigation} />
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
              {unassignedReservations.length > 0 && (
                <div className="floor-unassigned-alert" role="alert">
                  <TriangleAlert aria-hidden="true" />
                  <span>
                    <strong>{unassignedReservations.length} {unassignedReservations.length === 1 ? "party needs" : "parties need"} a table</strong>
                    Assign {unassignedReservations.length === 1 ? "this reservation" : "these reservations"} before service.
                  </span>
                </div>
              )}
              <div className="floor-reservation-list">
                {loading && !data ? (
                  <div className="floor-empty"><LoaderCircle className="spin" aria-hidden="true" /> Loading service…</div>
                ) : pendingReservations.length ? pendingReservations.map((reservation) => (
                  <button
                    type="button"
                    key={reservation.id}
                    draggable={liveService && !seatingMode}
                    className={`${selectedPendingId === reservation.id ? "selected" : ""}${reservation.is_unassigned ? " unassigned" : ""}`}
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
                    aria-label={reservation.is_unassigned
                      ? `${displayTime(reservation.start_time)}, ${reservation.guest_name}, party of ${reservation.party_size}, unassigned and needs a table`
                      : `${displayTime(reservation.start_time)}, ${reservation.guest_name}, party of ${reservation.party_size}, assigned to ${reservation.table_names.length > 1 ? "Tables" : "Table"} ${(reservation.table_names.length ? reservation.table_names : [reservation.table_name]).join(", ")}`}
                    aria-pressed={selectedPendingId === reservation.id}
                  >
                    <time>{displayTime(reservation.start_time)}</time>
                    <span className="floor-reservation-details">
                      <strong>{reservation.guest_name}</strong>
                      <small><Users aria-hidden="true" /> Party of {reservation.party_size}</small>
                      {reservation.notes && <em>{reservation.notes}</em>}
                    </span>
                    <span className="floor-reservation-tail" aria-hidden="true">
                      {reservation.is_unassigned ? (
                        <span className="floor-reservation-unassigned">
                          <TriangleAlert />
                          <strong>Unassigned</strong>
                        </span>
                      ) : (
                        <span className="floor-reservation-table">
                          <small>{reservation.table_names.length > 1 ? "Tables" : "Table"}</small>
                          <strong>{(reservation.table_names.length ? reservation.table_names : [reservation.table_name]).join("+")}</strong>
                        </span>
                      )}
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
                  <button
                    type="button"
                    className="floor-edit-trigger"
                    onClick={beginFloorEditing}
                    disabled={saving || editingFloor}
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
                    <small>Click a table or drag across the floor to select. Shift adds more; drag any selected table to move the group.</small>
                    {deletedTableIds.length > 0 && (
                      <small className="floor-editor-delete-note">
                        {deletedTableIds.length} table{deletedTableIds.length === 1 ? "" : "s"} queued for deletion. Assigned reservations will reflow when you save.
                      </small>
                    )}
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
                    <div className="floor-editor-tool-group" aria-label="Table arrangement tools">
                      <span>Arrange</span>
                      <button type="button" onClick={createStandardTwoTop} disabled={saving}>
                        <CirclePlus aria-hidden="true" /> New Table
                      </button>
                      <button type="button" onClick={cloneSelectedTables} disabled={!editorSelectedTables.length}>
                        <CopyPlus aria-hidden="true" /> Clone Table
                      </button>
                      <button
                        type="button"
                        className={`floor-editor-delete${deleteSelectionConfirmed ? " confirming" : ""}`}
                        onClick={deleteSelectedTables}
                        disabled={!editorSelectedTables.length}
                      >
                        <Trash2 aria-hidden="true" /> {deleteSelectionConfirmed ? "Confirm Delete" : `Delete Table${editorSelectedTables.length === 1 ? "" : "s"}`}
                      </button>
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
                          <option value="across">Across vertically</option>
                          <option value="across_horizontal">Across horizontally</option>
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
                className={`floor-canvas${seatingMode ? " assigning seating" : ""}${editingFloor ? " editing" : ""}${movingEditorTables ? " moving-tables" : ""}${floorMarqueeBounds ? " selecting-tables" : ""}`}
                onPointerDown={beginFloorMarquee}
                onPointerMove={updateFloorMarquee}
                onPointerUp={finishFloorMarquee}
                onPointerCancel={finishFloorMarquee}
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
                      data-floor-table-id={table.id}
                      className={`floor-table floor-table-${table.shape}${available ? " available" : ` occupied status-${reservation.status}`}${dropTargetTableId === table.id ? " drop-target" : ""}${selectedTableIds.includes(table.id) ? " seat-selected" : ""}${editorSelected ? " editor-selected" : ""}`}
                      style={{
                        left: `${table.position_x}%`,
                        top: `${table.position_y}%`,
                        width: `${table.width}px`,
                        height: `${table.height}px`,
                        "--table-rotation": `${table.rotation}deg`,
                        "--table-label-rotation": `${-table.rotation}deg`,
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
                      <span className="floor-table-surface" aria-hidden="true" />
                      <span className="floor-table-label">
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
                {floorMarqueeBounds && (
                  <div className="floor-selection-marquee" style={floorMarqueeBounds} aria-hidden="true" />
                )}
                {data && data.tables.length === 0 && (
                  <div className="floor-canvas-loading">
                    <CirclePlus aria-hidden="true" />
                    {editingFloor ? "Use New Table to create the first table." : "Choose Edit Floor to create the first table."}
                  </div>
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
