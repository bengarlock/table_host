"use client";

import {
  AlignHorizontalSpaceAround,
  AlignVerticalSpaceAround,
  Armchair,
  BadgeCheck,
  Ban,
  CakeSlice,
  CalendarCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleCheckBig,
  CircleDollarSign,
  CircleHelp,
  CirclePlus,
  Clock3,
  ClockAlert,
  Columns3,
  CopyPlus,
  GripVertical,
  Eye,
  LoaderCircle,
  Minus,
  PencilRuler,
  Plus,
  ReceiptText,
  RotateCcw,
  RotateCw,
  Redo2,
  Rows3,
  Save,
  Search,
  Sparkles,
  Tag,
  Trash2,
  TriangleAlert,
  Undo2,
  Utensils,
  UserPlus,
  UserX,
  Users,
  X,
} from "lucide-react";
import {
  CSSProperties,
  DragEvent,
  FormEvent,
  MouseEvent as ReactMouseEvent,
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
import { TagIcon } from "@/components/tag-icon";
import { appPath } from "@/lib/app-paths";
import { connectedSectionOutlines } from "@/lib/section-outline";
import { tableLabelPresentation } from "@/lib/table-label";
import { GUEST_TAGS, RESERVATION_TAGS } from "@/lib/reservation-tags";
import { formatTurnTime } from "@/lib/turn-time";
import styles from "./floor-status-popover.module.css";
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
  min_capacity?: number;
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

type FloorSection = {
  id: number;
  name: string;
  color: string;
  table_ids: number[];
};

type ServerAssignment = {
  id: number;
  name: string;
  color: string;
  table_ids: number[];
  section_ids: number[];
};

type ServiceStatus =
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
  seated_at: string | null;
  is_unassigned: boolean;
  notes: string;
  tags: string[];
  guest_notes?: string;
  guest_profile_notes?: string;
  guest_tags?: string[];
};

type ReservationEditDraft = {
  guestName: string;
  partySize: string;
  startTime: string;
  durationMinutes: string;
  status: ServiceStatus;
  reservationTags: string[];
  guestTags: string[];
  reservationNotes: string;
  guestNotes: string;
};

type ReservationActivity = {
  id: number;
  summary: string;
  created_at: string;
};

type TableBlock = { id: number; table_ids: number[]; table_names: string[]; start_time: string; duration_minutes: number; notes: string };

type ReservationUpdate = {
  table_id?: number;
  table_ids?: number[];
  guest_name?: string;
  party_size?: number;
  start_time?: string;
  duration_minutes?: number;
  status?: ServiceStatus;
  tags?: string[];
  notes?: string;
  guest_tags?: string[];
  guest_notes?: string;
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
  durationMinutes: number;
  guestId: number | null;
  guestName: string;
  notes: string;
  tags: string[];
};

type FloorStageMetrics = {
  width: number;
  height: number;
  scale: number;
};

type StatusPopover = {
  reservationId: number;
  tableName: string;
  left: number;
  top: number;
};

type AvailableTablePopover = { tableId: number; tableName: string; left: number; top: number };

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
  sections: FloorSection[];
  servers: ServerAssignment[];
  reservations: Reservation[];
  blocks?: TableBlock[];
  summary: { reservations: number; covers: number; seated: number };
};

const ACTIVE_STATUSES: ServiceStatus[] = [
  "seated",
  "entree",
  "dessert",
  "check_dropped",
  "paid",
];
const WAITING_STATUSES: ServiceStatus[] = ["booked", "confirmed", "late", "not_confirmed"];
const FLOOR_DESIGN_MIN_WIDTH = 1200;
const WALK_IN_RESERVATION_TAGS = RESERVATION_TAGS;
const PARTY_SIZE_PRESETS = [1, 2, 3, 4, 5, 6, 7, 8];
const MAX_PARTY_SIZE = 40;
const WALK_IN_TURN_TIMES = [45, 60, 75, 90, 105, 120, 135, 150, 180];
const RESERVATION_DETAIL_ANIMATION_MS = 180;
const RESERVATION_AUTO_SAVE_DELAY = 600;
const FLOOR_VIEW_PREFERENCES_KEY = "tablehost.floor-view-preferences";
const subscribeToHydration = () => () => undefined;

const SERVICE_STEPS = [
  { value: "seated" as const, label: "Seated", icon: Armchair },
  { value: "entree" as const, label: "Entree", icon: Utensils },
  { value: "dessert" as const, label: "Dessert", icon: CakeSlice },
  { value: "check_dropped" as const, label: "Check dropped", icon: ReceiptText },
  { value: "paid" as const, label: "Paid", icon: CircleDollarSign },
  { value: "complete" as const, label: "Done", icon: CircleCheckBig },
];
const RESERVATION_STATUS_OPTIONS = [
  { value: "booked" as const, label: "Booked", icon: CalendarCheck },
  { value: "confirmed" as const, label: "Confirmed", icon: BadgeCheck },
  { value: "late" as const, label: "Late", icon: ClockAlert },
  { value: "not_confirmed" as const, label: "Not Confirmed", icon: CircleHelp },
  { value: "cancelled" as const, label: "Cancelled", icon: Ban },
  { value: "no_show" as const, label: "No-show", icon: UserX },
];
const SERVICE_LIFECYCLE_STATUSES: ServiceStatus[] = SERVICE_STEPS.map((step) => step.value);

function displayTime(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
}

function minutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function floorReservationDraftKey(draft: ReservationEditDraft) {
  return JSON.stringify({
    guestName: draft.guestName.trim(),
    partySize: Number(draft.partySize),
    startTime: draft.startTime,
    durationMinutes: Number(draft.durationMinutes),
    status: draft.status,
    reservationTags: draft.reservationTags,
    guestTags: draft.guestTags,
    reservationNotes: draft.reservationNotes.trim(),
    guestNotes: draft.guestNotes.trim(),
  });
}

function floorReservationUpdateFromDraft(draft: ReservationEditDraft, reservation: Reservation): ReservationUpdate {
  return {
    guest_name: draft.guestName.trim(),
    party_size: Number(draft.partySize),
    start_time: draft.startTime,
    duration_minutes: Number(draft.durationMinutes),
    notes: draft.reservationNotes.trim(),
    tags: draft.reservationTags,
    guest_notes: draft.guestNotes.trim(),
    guest_tags: draft.guestTags,
    ...(draft.status === reservation.status ? {} : { status: draft.status }),
  };
}

function floorReservationDraftError(draft: ReservationEditDraft) {
  const partySize = Number(draft.partySize);
  const durationMinutes = Number(draft.durationMinutes);
  const reservationStart = minutes(draft.startTime);
  if (!draft.guestName.trim() || !Number.isInteger(partySize) || partySize < 1 || partySize > 40) {
    return "Enter a guest name and a party size from 1 to 40.";
  }
  if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 360) {
    return "Expected turn time must be between 15 minutes and 6 hours.";
  }
  if (!Number.isInteger(reservationStart) || reservationStart < 0 || reservationStart >= 24 * 60) {
    return "Enter a valid reservation time.";
  }
  return "";
}

function reservationTurnsOverlap(left: Reservation, right: Reservation) {
  const leftStart = minutes(left.start_time);
  const rightStart = minutes(right.start_time);
  return leftStart < rightStart + right.duration_minutes
    && rightStart < leftStart + left.duration_minutes;
}
function turnProgress(
  reservation: Reservation,
  now: number,
) {
  const startedAt = Date.parse(reservation.seated_at || "");
  if (Number.isNaN(startedAt)) return null;
  const durationMilliseconds = reservation.duration_minutes * 60_000;
  const elapsedMilliseconds = Math.max(0, now - startedAt);
  const remainingMilliseconds = Math.max(0, durationMilliseconds - elapsedMilliseconds);
  const overdueMilliseconds = Math.max(0, elapsedMilliseconds - durationMilliseconds);
  return {
    expired: elapsedMilliseconds >= durationMilliseconds,
    remainingMinutes: Math.ceil(remainingMilliseconds / 60_000),
    overdueMinutes: Math.ceil(overdueMilliseconds / 60_000),
    remainingMilliseconds,
    remainingPercent: clamp(remainingMilliseconds / durationMilliseconds, 0, 1) * 100,
    overduePercent: clamp(overdueMilliseconds / durationMilliseconds, 0, 1) * 100,
    overdueRemainingMilliseconds: Math.max(0, durationMilliseconds - overdueMilliseconds),
  };
}

function floorTimerPath(shape: DiningTable["shape"], expired: boolean) {
  if (shape === "round") {
    return expired
      ? "M50 3A47 47 0 1 1 50 97A47 47 0 1 1 50 3"
      : "M50 3A47 47 0 1 0 50 97A47 47 0 1 0 50 3";
  }
  return expired
    ? "M50 3H88A9 9 0 0 1 97 12V88A9 9 0 0 1 88 97H12A9 9 0 0 1 3 88V12A9 9 0 0 1 12 3H50"
    : "M50 3H12A9 9 0 0 0 3 12V88A9 9 0 0 0 12 97H88A9 9 0 0 0 97 88V12A9 9 0 0 0 88 3H50";
}

function displayTableAssignment(tableNames: string[]) {
  if (tableNames.length <= 3) return tableNames.join("+");
  const lowestTableNumber = [...tableNames].sort((left, right) => (
    left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" })
  ))[0];
  return `${lowestTableNumber}+`;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function nextAvailableTableName(sourceName: string, usedNames: Set<string>) {
  const trimmedName = sourceName.trim();
  const numberedName = trimmedName.match(/^(.*?)(\d+)$/);
  const prefix = numberedName?.[1] ?? "";
  const sourceNumber = numberedName ? Number(numberedName[2]) : 0;
  const numberWidth = numberedName?.[2].length ?? 0;
  let candidate = sourceNumber + 1;
  const formatCandidate = () => `${prefix}${String(candidate).padStart(numberWidth, "0")}`;
  while (usedNames.has(formatCandidate().toLocaleLowerCase())) candidate += 1;
  const candidateName = formatCandidate();
  usedNames.add(candidateName.toLocaleLowerCase());
  return candidateName;
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


function roundedOutlinePath(points: Array<{ x: number; y: number }>) {
  // Flush joins can repeat vertices. Remove zero-length edges before rounding,
  // otherwise their direction divides by zero and corrupts the SVG path.
  const distinct = points.filter((point, index) => {
    const previous = points[(index + points.length - 1) % points.length];
    return point.x !== previous.x || point.y !== previous.y;
  });
  points = distinct.filter((point, index) => {
    const previous = distinct[(index + distinct.length - 1) % distinct.length];
    const next = distinct[(index + 1) % distinct.length];
    return (point.x - previous.x) * (next.y - point.y) !== (point.y - previous.y) * (next.x - point.x);
  });
  const distance = (first: { x: number; y: number }, second: { x: number; y: number }) => Math.hypot(second.x - first.x, second.y - first.y);
  const toward = (from: { x: number; y: number }, to: { x: number; y: number }, amount: number) => {
    const length = distance(from, to);
    if (!length) return from;
    return { x: from.x + (to.x - from.x) * amount / length, y: from.y + (to.y - from.y) * amount / length };
  };
  const corners = points.map((point, index) => {
    const previous = points[(index + points.length - 1) % points.length];
    const next = points[(index + 1) % points.length];
    const radius = Math.min(24, distance(point, previous) / 3, distance(point, next) / 3);
    return { point, entry: toward(point, previous, radius), exit: toward(point, next, radius) };
  });
  return corners.reduce((path, corner) => `${path} L ${corner.entry.x} ${corner.entry.y} Q ${corner.point.x} ${corner.point.y} ${corner.exit.x} ${corner.exit.y}`, `M ${corners[0].entry.x} ${corners[0].entry.y}`) + " Z";
}

function sectionOverlay(section: FloorSection, tables: DiningTable[], stage: FloorStageMetrics, sections: FloorSection[]) {
  const selected = tables.filter((table) => section.table_ids.includes(table.id));
  if (!selected.length) return null;
  const rows = selected.sort((first, second) => first.position_y - second.position_y).reduce<DiningTable[][]>((groups, table) => {
    const row = groups.find((group) => Math.abs(group[0].position_y - table.position_y) < 10);
    if (row) row.push(table); else groups.push([table]);
    return groups;
  }, []);
  const bounds = rows.map((row) => {
    const padding = 25;
    const left = Math.min(...row.map((table) => stage.width * table.position_x / 100 - table.width / 2 - padding));
    const right = Math.max(...row.map((table) => stage.width * table.position_x / 100 + table.width / 2 + padding));
    const top = Math.min(...row.map((table) => stage.height * table.position_y / 100 - table.height / 2 - padding));
    const bottom = Math.max(...row.map((table) => stage.height * table.position_y / 100 + table.height / 2 + padding));
    return { left, right, top, bottom };
  });
  // Small differences in table widths should not create a step at a join.
  // Expand outward so smoothing never removes coverage from either row.
  if (bounds.length === 2) {
    const [upper, lower] = bounds;
    const overlap = Math.min(upper.right, lower.right) - Math.max(upper.left, lower.left);
    if (overlap > 0 && lower.top > upper.bottom) {
      if (Math.abs(upper.left - lower.left) <= 24) {
        upper.left = lower.left = Math.min(upper.left, lower.left);
      }
      if (Math.abs(upper.right - lower.right) <= 24) {
        upper.right = lower.right = Math.max(upper.right, lower.right);
      }
    }
  }
  const first = bounds[0];
  const obstacles = sections.filter((other) => other.id !== section.id).flatMap((other) => {
    const otherTables = tables.filter((table) => other.table_ids.includes(table.id));
    const groups: typeof otherTables[] = [];
    for (const table of [...otherTables].sort((a, b) => a.position_y - b.position_y)) {
      const group = groups.find((row) => Math.abs(row[0].position_y - table.position_y) < 10);
      if (group) group.push(table); else groups.push([table]);
    }
    const dimensions = stage;
    return groups.map((row) => ({
      left: Math.min(...row.map((table) => dimensions.width * table.position_x / 100 - table.width / 2 - 25)),
      right: Math.max(...row.map((table) => dimensions.width * table.position_x / 100 + table.width / 2 + 25)),
      top: Math.min(...row.map((table) => dimensions.height * table.position_y / 100 - table.height / 2 - 25)),
      bottom: Math.max(...row.map((table) => dimensions.height * table.position_y / 100 + table.height / 2 + 25)),
    }));
  });
  const joinedPaths = connectedSectionOutlines(bounds, obstacles).map(roundedOutlinePath);
  return {
    paths: joinedPaths,
    connectors: [] as string[],
    labelX: Math.max(14, first.left + 16),
    labelY: Math.max(26, first.top + 24),
    labelWidth: Math.max(74, section.name.length * 9 + 20),
  };
}

function statusLabel(status: ServiceStatus) {
  return [...RESERVATION_STATUS_OPTIONS, ...SERVICE_STEPS].find((step) => step.value === status)?.label || status;
}

function statusOptionsFor(status: ServiceStatus) {
  return SERVICE_LIFECYCLE_STATUSES.includes(status) ? SERVICE_STEPS : RESERVATION_STATUS_OPTIONS;
}

function statusPopoverPosition(target: HTMLElement) {
  const bounds = target.getBoundingClientRect();
  const margin = 12;
  const width = Math.min(308, window.innerWidth - margin * 2);
  const estimatedHeight = 352;
  const left = bounds.right + 14 + width <= window.innerWidth - margin
    ? bounds.right + 14
    : Math.max(margin, bounds.left - width - 14);
  return {
    left: Math.round(Math.min(left, window.innerWidth - width - margin)),
    top: Math.round(clamp(bounds.top, margin, Math.max(margin, window.innerHeight - estimatedHeight - margin))),
  };
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

type FloorEditorSnapshot = {
  tables: DiningTable[];
  deletedTableIds: number[];
  selectedTableIds: number[];
};

type FloorTableDrag = {
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
  origins: Array<{ id: number; positionX: number; positionY: number }>;
  minimumDeltaX: number;
  maximumDeltaX: number;
  minimumDeltaY: number;
  maximumDeltaY: number;
  initialSnapshot: FloorEditorSnapshot;
  latestTables: DiningTable[];
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

type FloorTableBounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

type FloorPoint = {
  x: number;
  y: number;
};

type FloorTableFootprint = {
  id: number;
  points: FloorPoint[];
};

const FLOOR_OVERLAP_TOLERANCE = 0.5;

function floorTableVisualBounds(element: HTMLElement): FloorTableBounds {
  const surface = element.querySelector<HTMLElement>(".floor-table-surface");
  const rectangles = [
    (surface || element).getBoundingClientRect(),
    ...Array.from(element.querySelectorAll<HTMLElement>(".chair"))
      .map((chair) => chair.getBoundingClientRect()),
  ];
  return {
    left: Math.min(...rectangles.map((bounds) => bounds.left)),
    right: Math.max(...rectangles.map((bounds) => bounds.right)),
    top: Math.min(...rectangles.map((bounds) => bounds.top)),
    bottom: Math.max(...rectangles.map((bounds) => bounds.bottom)),
  };
}

function floorTableBoundsOverlap(
  left: FloorTableBounds,
  right: FloorTableBounds,
  clearance = 0,
) {
  return left.left < right.right + clearance
    && left.right > right.left - clearance
    && left.top < right.bottom + clearance
    && left.bottom > right.top - clearance;
}

function rotateFloorPoint(point: FloorPoint, center: FloorPoint, radians: number): FloorPoint {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const relativeX = point.x - center.x;
  const relativeY = point.y - center.y;
  return {
    x: center.x + relativeX * cosine - relativeY * sine,
    y: center.y + relativeX * sine + relativeY * cosine,
  };
}

function floorTableSurfaceFootprint(element: HTMLElement, stage: HTMLElement): FloorTableFootprint | null {
  const surface = element.querySelector<HTMLElement>(".floor-table-surface");
  if (!surface || !surface.offsetWidth || !surface.offsetHeight) return null;

  const stageBounds = stage.getBoundingClientRect();
  const scale = stage.offsetWidth ? stageBounds.width / stage.offsetWidth : 1;
  const surfaceBounds = surface.getBoundingClientRect();
  const center = {
    x: (surfaceBounds.left + surfaceBounds.right) / 2,
    y: (surfaceBounds.top + surfaceBounds.bottom) / 2,
  };
  const halfWidth = surface.offsetWidth * scale / 2;
  const halfHeight = surface.offsetHeight * scale / 2;
  const rotation = Number.parseFloat(
    window.getComputedStyle(element).getPropertyValue("--table-rotation"),
  ) || 0;
  const isRound = element.classList.contains("floor-table-round");
  const unrotatedPoints = isRound
    ? Array.from({ length: 24 }, (_, index) => {
      const angle = index * (Math.PI * 2 / 24);
      return {
        x: center.x + Math.cos(angle) * halfWidth,
        y: center.y + Math.sin(angle) * halfHeight,
      };
    })
    : [
      { x: center.x - halfWidth, y: center.y - halfHeight },
      { x: center.x + halfWidth, y: center.y - halfHeight },
      { x: center.x + halfWidth, y: center.y + halfHeight },
      { x: center.x - halfWidth, y: center.y + halfHeight },
    ];

  return {
    id: Number(element.dataset.floorTableId),
    points: unrotatedPoints.map((point) => rotateFloorPoint(point, center, rotation * Math.PI / 180)),
  };
}

function projectFloorFootprint(points: FloorPoint[], axis: FloorPoint) {
  const projections = points.map((point) => point.x * axis.x + point.y * axis.y);
  return {
    min: Math.min(...projections),
    max: Math.max(...projections),
  };
}

function floorTableFootprintsOverlap(left: FloorTableFootprint, right: FloorTableFootprint) {
  for (const footprint of [left, right]) {
    for (let index = 0; index < footprint.points.length; index += 1) {
      const start = footprint.points[index];
      const end = footprint.points[(index + 1) % footprint.points.length];
      const length = Math.hypot(end.x - start.x, end.y - start.y);
      if (!length) continue;
      const axis = {
        x: -(end.y - start.y) / length,
        y: (end.x - start.x) / length,
      };
      const leftProjection = projectFloorFootprint(left.points, axis);
      const rightProjection = projectFloorFootprint(right.points, axis);
      if (
        leftProjection.max <= rightProjection.min + FLOOR_OVERLAP_TOLERANCE
        || rightProjection.max <= leftProjection.min + FLOOR_OVERLAP_TOLERANCE
      ) {
        return false;
      }
    }
  }
  return true;
}

function floorTableOverlapIds(stage: HTMLElement) {
  const tables = Array.from(stage.querySelectorAll<HTMLElement>("[data-floor-table-id]"))
    .map((element) => floorTableSurfaceFootprint(element, stage))
    .filter((table): table is FloorTableFootprint => table !== null);
  const overlappingIds = new Set<number>();
  tables.forEach((table, index) => {
    tables.slice(index + 1).forEach((other) => {
      if (!floorTableFootprintsOverlap(table, other)) return;
      overlappingIds.add(table.id);
      overlappingIds.add(other.id);
    });
  });
  return overlappingIds;
}

type MeasuredFloorTable = {
  table: DiningTable;
  bounds: FloorTableBounds;
  centerX: number;
  centerY: number;
};

function median(values: number[]) {
  if (!values.length) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

function polishedAxisCenters(
  items: MeasuredFloorTable[],
  axis: "x" | "y",
  stageStart: number,
  stageEnd: number,
) {
  const centerOf = (item: MeasuredFloorTable) => axis === "x" ? item.centerX : item.centerY;
  const startOf = (item: MeasuredFloorTable) => axis === "x" ? item.bounds.left : item.bounds.top;
  const endOf = (item: MeasuredFloorTable) => axis === "x" ? item.bounds.right : item.bounds.bottom;
  const sizes = items.map((item) => endOf(item) - startOf(item));
  const typicalSize = median(sizes);
  const alignmentTolerance = Math.max(18, typicalSize * 0.62);
  const clusters: MeasuredFloorTable[][] = [];

  [...items].sort((left, right) => centerOf(left) - centerOf(right)).forEach((item) => {
    const current = clusters.at(-1);
    const currentCenter = current
      ? current.reduce((total, member) => total + centerOf(member), 0) / current.length
      : 0;
    // Tables sharing the perpendicular span cannot share this alignment line.
    // In particular, adjacent stools in one column must remain separate rows.
    const sharesPerpendicularSpan = current?.some((member) => axis === "x"
      ? item.bounds.top < member.bounds.bottom && item.bounds.bottom > member.bounds.top
      : item.bounds.left < member.bounds.right && item.bounds.right > member.bounds.left);
    if (!current || sharesPerpendicularSpan || Math.abs(centerOf(item) - currentCenter) > alignmentTolerance) {
      clusters.push([item]);
    } else {
      current.push(item);
    }
  });

  const measuredClusters = clusters.map((members) => {
    const existingStart = Math.min(...members.map(startOf));
    const existingEnd = Math.max(...members.map(endOf));
    const center = (existingStart + existingEnd) / 2;
    const before = Math.max(...members.map((item) => centerOf(item) - startOf(item)));
    const after = Math.max(...members.map((item) => endOf(item) - centerOf(item)));
    return { members, existingStart, existingEnd, center, before, after, size: before + after };
  }).sort((left, right) => left.center - right.center);

  const gaps = measuredClusters.slice(1).map(
    (cluster, index) => Math.max(0, cluster.existingStart - measuredClusters[index].existingEnd),
  );
  const splitThreshold = Math.max(
    typicalSize * 1.5,
    Math.min(median(gaps.filter((gap) => gap > 0)) * 2.5, typicalSize * 3),
  );
  const segments: typeof measuredClusters[] = [];
  measuredClusters.forEach((cluster, index) => {
    const previous = measuredClusters[index - 1];
    const gap = previous ? cluster.existingStart - previous.existingEnd : 0;
    if (!segments.length || gap > splitThreshold) segments.push([cluster]);
    else segments.at(-1)!.push(cluster);
  });

  const targetCenters = new Map<number, number>();
  segments.forEach((segment) => {
    const occupiedSize = segment.reduce((total, cluster) => total + cluster.size, 0);
    const existingStart = segment[0].existingStart;
    const existingEnd = segment.at(-1)!.existingEnd;
    const minimumGap = Math.max(12, typicalSize * 0.16);
    const desiredSpan = Math.max(
      existingEnd - existingStart,
      occupiedSize + minimumGap * Math.max(0, segment.length - 1),
    );
    const availableSpan = stageEnd - stageStart;
    const span = Math.min(desiredSpan, availableSpan);
    const centeredStart = (existingStart + existingEnd - span) / 2;
    const layoutStart = clamp(centeredStart, stageStart, Math.max(stageStart, stageEnd - span));
    const gap = segment.length > 1 ? Math.max(0, (span - occupiedSize) / (segment.length - 1)) : 0;
    let cursor = layoutStart;
    segment.forEach((cluster) => {
      const targetCenter = cursor + cluster.before;
      cluster.members.forEach((item) => targetCenters.set(item.table.id, targetCenter));
      cursor += cluster.size + gap;
    });
  });
  return targetCenters;
}

export function FloorWorkspace({ initialServiceDate, initialShiftSlug }: FloorWorkspaceProps) {
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const [selectedServiceDate, setServiceDate] = useState(initialServiceDate || "");
  const serviceDate = selectedServiceDate || (hydrated ? todayLocal() : "");
  const [shiftSlug, setShiftSlug] = useState(initialServiceDate ? initialShiftSlug || "" : "");
  const [data, setData] = useState<GridData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showReservationTimes, setShowReservationTimes] = useState(false);
  const [showSectionOutlines, setShowSectionOutlines] = useState(true);
  const [showFloorTimes, setShowFloorTimes] = useState(false);
  const [selectedServerId, setSelectedServerId] = useState<number | null>(null);
  const [viewPreferencesRestored, setViewPreferencesRestored] = useState(false);
  const [floorClock, setFloorClock] = useState(() => Date.now());
  const [statusPopover, setStatusPopover] = useState<StatusPopover | null>(null);
  const [availableTablePopover, setAvailableTablePopover] = useState<AvailableTablePopover | null>(null);
  const [selectedPendingId, setSelectedPendingId] = useState<number | null>(null);
  const [focusedReservationId, setFocusedReservationId] = useState<number | null>(null);
  const [reservationEditDraft, setReservationEditDraft] = useState<ReservationEditDraft | null>(null);
  const [reservationAutoSaveError, setReservationAutoSaveError] = useState("");
  const [reservationDetailClosing, setReservationDetailClosing] = useState(false);
  const [activityEvents, setActivityEvents] = useState<ReservationActivity[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const reservationStatusMenuRef = useRef<HTMLDetailsElement>(null);
  const viewMenuRef = useRef<HTMLDetailsElement>(null);
  const serversMenuRef = useRef<HTMLDetailsElement>(null);
  const reservationDetailCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reservationAutoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reservationSavedDraftKeyRef = useRef("");
  const reservationFailedDraftKeyRef = useRef("");
  const reservationSavePromiseRef = useRef<Promise<boolean> | null>(null);
  const [draggedReservationId, setDraggedReservationId] = useState<number | null>(null);
  const [dropTargetTableId, setDropTargetTableId] = useState<number | null>(null);
  const [seatingMode, setSeatingMode] = useState<"reservation" | "reassignment" | "walk-in" | null>(null);
  const [selectedTableIds, setSelectedTableIds] = useState<number[]>([]);
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [floorBlockOpen, setFloorBlockOpen] = useState(false);
  const [floorBlockTableIds, setFloorBlockTableIds] = useState<number[]>([]);
  const [floorBlockStartTime, setFloorBlockStartTime] = useState("");
  const [floorBlockScope, setFloorBlockScope] = useState<"turn" | "shift">("turn");
  const [floorBlockNotes, setFloorBlockNotes] = useState("");
  const [walkInPartySize, setWalkInPartySize] = useState(2);
  const [walkInCustomPartySize, setWalkInCustomPartySize] = useState("");
  const [walkInDurationMinutes, setWalkInDurationMinutes] = useState(90);
  const [walkInGuestQuery, setWalkInGuestQuery] = useState("");
  const [walkInNotes, setWalkInNotes] = useState("");
  const [walkInTags, setWalkInTags] = useState<string[]>([]);
  const [walkInTagInput, setWalkInTagInput] = useState("");
  const [walkInGuestResults, setWalkInGuestResults] = useState<GuestRecord[]>([]);
  const [walkInSelectedGuest, setWalkInSelectedGuest] = useState<GuestRecord | null>(null);
  const [walkInDraft, setWalkInDraft] = useState<WalkInDraft | null>(null);
  const [guestSearchLoading, setGuestSearchLoading] = useState(false);
  const [creatingGuest, setCreatingGuest] = useState(false);
  const [editingFloor, setEditingFloor] = useState(false);
  const [editedTables, setEditedTables] = useState<DiningTable[]>([]);
  const [editorSelectedTableIds, setEditorSelectedTableIds] = useState<number[]>([]);
  const [deletedTableIds, setDeletedTableIds] = useState<number[]>([]);
  const [floorUndoStack, setFloorUndoStack] = useState<FloorEditorSnapshot[]>([]);
  const [floorRedoStack, setFloorRedoStack] = useState<FloorEditorSnapshot[]>([]);
  const [deleteConfirmationIds, setDeleteConfirmationIds] = useState<number[]>([]);
  const [movingEditorTables, setMovingEditorTables] = useState(false);
  const [overlappingTableIds, setOverlappingTableIds] = useState<Set<number>>(new Set());
  const [floorMarqueeBounds, setFloorMarqueeBounds] = useState<FloorMarqueeBounds | null>(null);
  const [floorStageMetrics, setFloorStageMetrics] = useState<FloorStageMetrics>({
    width: FLOOR_DESIGN_MIN_WIDTH,
    height: 420,
    scale: 1,
  });
  const resolveCurrentService = useRef(!initialServiceDate);
  const floorCanvasRef = useRef<HTMLDivElement>(null);
  const floorStageRef = useRef<HTMLDivElement>(null);
  const statusPopoverRef = useRef<HTMLDivElement>(null);
  const floorTableDragRef = useRef<FloorTableDrag | null>(null);
  const floorMarqueeDragRef = useRef<FloorMarqueeDrag | null>(null);
  const floorLoadRequestRef = useRef(0);
  const suppressEditorClickRef = useRef(false);

  const loadFloor = useCallback(async (signal?: AbortSignal) => {
    if (!serviceDate) return;
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
    let preferences: Record<string, unknown> = {};
    try {
      const saved = JSON.parse(window.localStorage.getItem(FLOOR_VIEW_PREFERENCES_KEY) || "{}");
      if (saved && typeof saved === "object" && !Array.isArray(saved)) {
        preferences = saved as Record<string, unknown>;
      }
    } catch {
      // Ignore unavailable or malformed browser storage and keep the defaults.
    }
    const restorePreferences = window.requestAnimationFrame(() => {
      if (typeof preferences.showReservationTimes === "boolean") setShowReservationTimes(preferences.showReservationTimes);
      if (typeof preferences.showFloorTimes === "boolean") setShowFloorTimes(preferences.showFloorTimes);
      if (typeof preferences.showSectionOutlines === "boolean") setShowSectionOutlines(preferences.showSectionOutlines);
      setViewPreferencesRestored(true);
    });
    return () => window.cancelAnimationFrame(restorePreferences);
  }, []);

  useEffect(() => {
    if (!viewPreferencesRestored) return;
    try {
      window.localStorage.setItem(FLOOR_VIEW_PREFERENCES_KEY, JSON.stringify({
        showReservationTimes,
        showFloorTimes,
        showSectionOutlines,
      }));
    } catch {
      // The floor remains usable when browser storage is unavailable.
    }
  }, [showFloorTimes, showReservationTimes, showSectionOutlines, viewPreferencesRestored]);

  useEffect(() => {
    const canvas = floorCanvasRef.current;
    if (!canvas || editingFloor) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      const height = entry.contentRect.height;
      const nextScale = width > 0 ? Math.min(1, width / FLOOR_DESIGN_MIN_WIDTH) : 1;
      const nextMetrics = {
        width: width > 0 ? width / nextScale : FLOOR_DESIGN_MIN_WIDTH,
        height: height > 0 ? height / nextScale : 420,
        scale: nextScale,
      };
      setFloorStageMetrics((current) => (
        Math.abs(current.width - nextMetrics.width) < 0.5
          && Math.abs(current.height - nextMetrics.height) < 0.5
          && Math.abs(current.scale - nextMetrics.scale) < 0.001
          ? current
          : nextMetrics
      ));
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [editingFloor]);

  useEffect(() => {
    const stage = floorStageRef.current;
    if (!editingFloor || !stage) {
      setOverlappingTableIds((current) => current.size ? new Set() : current);
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      const next = floorTableOverlapIds(stage);
      setOverlappingTableIds((current) => (
        current.size === next.size && [...current].every((id) => next.has(id)) ? current : next
      ));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [editedTables, editingFloor, floorStageMetrics]);

  useEffect(() => {
    return () => {
      if (reservationDetailCloseTimerRef.current) clearTimeout(reservationDetailCloseTimerRef.current);
      if (reservationAutoSaveTimerRef.current) clearTimeout(reservationAutoSaveTimerRef.current);
    };
  }, []);

  useEffect(() => {
    function dismissMenus(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      [viewMenuRef.current, serversMenuRef.current].forEach((menu) => {
        if (menu?.open && !menu.contains(target)) menu.removeAttribute("open");
      });
    }

    window.addEventListener("pointerdown", dismissMenus);
    return () => window.removeEventListener("pointerdown", dismissMenus);
  }, []);

  useEffect(() => {
    function dismissStatusPopover(event: PointerEvent) {
      const target = event.target;
      if (
        target instanceof Node
        && !statusPopoverRef.current?.contains(target)
        && !(target instanceof Element && target.closest("[data-floor-table-id]"))
      ) {
        setStatusPopover(null);
        setAvailableTablePopover(null);
      }
    }
    function dismissForViewportChange() {
      setStatusPopover(null);
      setAvailableTablePopover(null);
    }
    function dismissForEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setStatusPopover(null);
    }
    window.addEventListener("pointerdown", dismissStatusPopover);
    window.addEventListener("resize", dismissForViewportChange);
    window.addEventListener("scroll", dismissForViewportChange, true);
    window.addEventListener("keydown", dismissForEscape);
    return () => {
      window.removeEventListener("pointerdown", dismissStatusPopover);
      window.removeEventListener("resize", dismissForViewportChange);
      window.removeEventListener("scroll", dismissForViewportChange, true);
      window.removeEventListener("keydown", dismissForEscape);
    };
  }, []);

  useEffect(() => {
    if (!walkInOpen) return;
    const query = walkInGuestQuery.trim();
    if (query.length < 2) return;

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
    () => data?.reservations.filter(
      (reservation) => reservation.is_unassigned && WAITING_STATUSES.includes(reservation.status),
    ) || [],
    [data],
  );
  const pendingReservations = useMemo(
    () => data?.reservations.filter(
      (reservation) => WAITING_STATUSES.includes(reservation.status),
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
  const scheduledReservationsByTable = useMemo(() => {
    const reservationsByTable = new Map<number, Reservation[]>();
    [...(data?.reservations || [])]
      .filter((reservation) => (
        !reservation.is_unassigned
        && [...WAITING_STATUSES, ...ACTIVE_STATUSES].includes(reservation.status)
      ))
      .sort((left, right) => left.start_time.localeCompare(right.start_time))
      .forEach((reservation) => {
        const tableIds = reservation.table_ids.length
          ? reservation.table_ids
          : reservation.table_id === null ? [] : [reservation.table_id];
        tableIds.forEach((tableId) => {
          reservationsByTable.set(tableId, [...(reservationsByTable.get(tableId) || []), reservation]);
        });
      });
    return reservationsByTable;
  }, [data?.reservations]);
  const overlappingReservationIds = useMemo(() => {
    const ids = new Set<number>();
    scheduledReservationsByTable.forEach((reservations) => {
      reservations.forEach((reservation, index) => {
        reservations.slice(index + 1).forEach((otherReservation) => {
          if (!reservationTurnsOverlap(reservation, otherReservation)) return;
          ids.add(reservation.id);
          ids.add(otherReservation.id);
        });
      });
    });
    return ids;
  }, [scheduledReservationsByTable]);
  const selectedPending = pendingReservations.find((item) => item.id === selectedPendingId) || null;
  const draggedReservation = pendingReservations.find((item) => item.id === draggedReservationId) || null;
  const focusedReservation = data?.reservations.find((item) => item.id === focusedReservationId) || null;
  const popoverReservation = data?.reservations.find((item) => item.id === statusPopover?.reservationId) || null;
  const selectedSeatingCapacity = useMemo(
    () => (data?.tables || [])
      .filter((table) => selectedTableIds.includes(table.id))
      .reduce((total, table) => total + table.capacity, 0),
    [data?.tables, selectedTableIds],
  );
  const seatingPartySize = seatingMode === "walk-in"
    ? walkInDraft?.partySize
    : selectedPending?.party_size;
  const seatingCapacityWarning = Boolean(
    seatingMode !== "reassignment"
    && seatingPartySize
    && selectedTableIds.length
    && selectedSeatingCapacity < seatingPartySize,
  );
  const focusedStatusOption = reservationEditDraft
    ? [...RESERVATION_STATUS_OPTIONS, ...SERVICE_STEPS].find((option) => option.value === reservationEditDraft.status)
    : null;
  const FocusedStatusIcon = focusedStatusOption?.icon;
  const liveService = hydrated && serviceDate === data?.current_service_date;
  useEffect(() => {
    if (!liveService) return;
    const timer = window.setInterval(() => setFloorClock(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [liveService]);
  const displayedTables = useMemo(
    () => editingFloor ? editedTables : data?.tables || [],
    [data?.tables, editedTables, editingFloor],
  );
  const sectionOverlays = useMemo(
    () => (data?.sections || []).map((section, index) => ({
      section,
      color: section.color || ["#d9aa62", "#5fa8d3", "#b174b8", "#65a97b", "#d3835e"][index % 5],
      shape: sectionOverlay(section, displayedTables, floorStageMetrics, data?.sections || []),
    })).filter((overlay) => overlay.shape),
    [data?.sections, displayedTables, floorStageMetrics],
  );
  const selectedServer = data?.servers.find((server) => server.id === selectedServerId) || null;
  const serverByTable = useMemo(() => {
    const sections = new Map((data?.sections || []).map((section) => [section.id, section]));
    const sectionAssignments = new Map<number, ServerAssignment>();
    const directAssignments = new Map<number, ServerAssignment>();
    (data?.servers || []).forEach((server) => {
      server.section_ids.forEach((sectionId) => sections.get(sectionId)?.table_ids.forEach((tableId) => sectionAssignments.set(tableId, server)));
      server.table_ids.forEach((tableId) => directAssignments.set(tableId, server));
    });
    // A host's individual table choice is more specific than a bulk section
    // assignment and must remain visible even if sections overlap.
    return new Map([...sectionAssignments, ...directAssignments]);
  }, [data?.sections, data?.servers]);
  const editorSelectedTables = useMemo(
    () => editedTables.filter((table) => editorSelectedTableIds.includes(table.id)),
    [editedTables, editorSelectedTableIds],
  );
  const selectedEditorTable = editorSelectedTables.length === 1 ? editorSelectedTables[0] : null;
  const duplicateTableNumberIds = useMemo(() => {
    const idsByNumber = new Map<string, number[]>();
    editedTables.forEach((table) => {
      const number = table.name.trim().toLocaleLowerCase();
      if (!number) return;
      idsByNumber.set(number, [...(idsByNumber.get(number) || []), table.id]);
    });
    return new Set(
      [...idsByNumber.values()]
        .filter((ids) => ids.length > 1)
        .flat(),
    );
  }, [editedTables]);
  const missingTableNumberIds = useMemo(
    () => new Set(editedTables.filter((table) => !table.name.trim()).map((table) => table.id)),
    [editedTables],
  );
  const floorHasInvalidTableNumbers = duplicateTableNumberIds.size > 0 || missingTableNumberIds.size > 0;
  const floorHasOverlappingTables = overlappingTableIds.size > 0;
  const floorHasInvalidCapacity = editedTables.some((table) =>
    (table.min_capacity ?? 1) < 1 || (table.min_capacity ?? 1) > table.capacity);
  const editorValues = useMemo(() => {
    const first = editorSelectedTables[0];
    if (!first) return null;
    const shared = <Key extends keyof DiningTable,>(key: Key) =>
      editorSelectedTables.every((table) => table[key] === first[key]) ? first[key] : "";
    return {
      capacity: shared("capacity"),
      minCapacity: shared("min_capacity") ?? 1,
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

  function openReservationDetails(reservation: Reservation) {
    if (focusedReservationId === reservation.id && !reservationDetailClosing) {
      void closeReservationDetails();
      return;
    }
    if (reservationDetailCloseTimerRef.current) {
      clearTimeout(reservationDetailCloseTimerRef.current);
      reservationDetailCloseTimerRef.current = null;
    }
    setReservationDetailClosing(false);
    setFocusedReservationId(reservation.id);
    setActivityEvents([]);
    void loadReservationActivity(reservation.id);
    const draft = {
      guestName: reservation.guest_name,
      partySize: String(reservation.party_size),
      startTime: reservation.start_time,
      durationMinutes: String(reservation.duration_minutes),
      status: reservation.status,
      reservationTags: reservation.tags || [],
      guestTags: reservation.guest_tags || [],
      reservationNotes: reservation.notes || "",
      guestNotes: reservation.guest_profile_notes || reservation.guest_notes || "",
    };
    reservationSavedDraftKeyRef.current = floorReservationDraftKey(draft);
    reservationFailedDraftKeyRef.current = "";
    setReservationAutoSaveError("");
    setReservationEditDraft(draft);
  }

  async function loadReservationActivity(reservationId: number) {
    setActivityLoading(true);
    try {
      const response = await fetch(appPath(`/api/grid/reservations/${reservationId}/history`), {
        cache: "no-store",
      });
      const payload = (await response.json()) as ReservationActivity[] | Record<string, unknown>;
      if (!response.ok) throw new Error(readError(payload));
      setActivityEvents(payload as ReservationActivity[]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load reservation activity.");
      setActivityEvents([]);
    } finally {
      setActivityLoading(false);
    }
  }

  function setReservationPartySize(value: number | string) {
    setReservationEditDraft((current) => current && ({ ...current, partySize: String(value) }));
  }

  function adjustReservationPartySize(delta: number) {
    const currentSize = Number(reservationEditDraft?.partySize);
    setReservationPartySize(clamp(Number.isInteger(currentSize) ? currentSize + delta : 9, 9, MAX_PARTY_SIZE));
  }

  function adjustReservationTurnTime(delta: number) {
    const currentMinutes = Number(reservationEditDraft?.durationMinutes);
    const nextMinutes = clamp(Number.isInteger(currentMinutes) ? currentMinutes + delta : 90, 15, 360);
    setReservationEditDraft((current) => current && ({ ...current, durationMinutes: String(nextMinutes) }));
  }

  function toggleReservationEditTag(kind: "reservationTags" | "guestTags", tag: string) {
    setReservationEditDraft((current) => {
      if (!current) return current;
      const selectedTags = current[kind];
      return {
        ...current,
        [kind]: selectedTags.includes(tag)
          ? selectedTags.filter((selectedTag) => selectedTag !== tag)
          : [...selectedTags, tag],
      };
    });
  }

  const dismissReservationDetails = useCallback(() => {
    if (focusedReservationId === null) return;
    if (reservationDetailCloseTimerRef.current) clearTimeout(reservationDetailCloseTimerRef.current);
    setReservationDetailClosing(true);
    reservationDetailCloseTimerRef.current = setTimeout(() => {
      setFocusedReservationId(null);
      setReservationEditDraft(null);
      setReservationDetailClosing(false);
      reservationDetailCloseTimerRef.current = null;
    }, RESERVATION_DETAIL_ANIMATION_MS);
  }, [focusedReservationId]);

  const persistFloorReservationDetails = useCallback(async () => {
    if (reservationSavePromiseRef.current) await reservationSavePromiseRef.current;
    if (!focusedReservation || !reservationEditDraft) return true;

    const draftKey = floorReservationDraftKey(reservationEditDraft);
    if (draftKey === reservationSavedDraftKeyRef.current) return true;
    const validationError = floorReservationDraftError(reservationEditDraft);
    if (validationError) {
      reservationFailedDraftKeyRef.current = draftKey;
      setReservationAutoSaveError(validationError);
      return false;
    }
    if (
      reservationEditDraft.status !== focusedReservation.status
      && !liveService
      && SERVICE_LIFECYCLE_STATUSES.includes(reservationEditDraft.status)
    ) {
      reservationFailedDraftKeyRef.current = draftKey;
      setReservationAutoSaveError("Reservations cannot be marked with an in-service outcome on future dates.");
      return false;
    }

    const updates = floorReservationUpdateFromDraft(reservationEditDraft, focusedReservation);
    const savePromise = (async () => {
      setSaving(true);
      setReservationAutoSaveError("");
      try {
        const response = await fetch(appPath(`/api/grid/reservations/${focusedReservation.id}`), {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(updates),
        });
        const payload = (await response.json()) as Reservation | Record<string, unknown>;
        if (!response.ok) throw new Error(readError(payload));
        const savedReservation = payload as Reservation;
        setData((current) => current && ({
          ...current,
          reservations: current.reservations.map((reservation) => (
            reservation.id === savedReservation.id ? savedReservation : reservation
          )),
        }));
        setSelectedPendingId(null);
        reservationSavedDraftKeyRef.current = draftKey;
        reservationFailedDraftKeyRef.current = "";
        if (savedReservation.status === "complete") dismissReservationDetails();
        return true;
      } catch (reason) {
        reservationFailedDraftKeyRef.current = draftKey;
        setReservationAutoSaveError(reason instanceof Error ? reason.message : "Unable to save changes automatically.");
        return false;
      } finally {
        reservationSavePromiseRef.current = null;
        setSaving(false);
      }
    })();
    reservationSavePromiseRef.current = savePromise;
    return savePromise;
  }, [dismissReservationDetails, focusedReservation, liveService, reservationEditDraft]);

  async function closeReservationDetails() {
    if (focusedReservationId === null) return;
    if (reservationAutoSaveTimerRef.current) clearTimeout(reservationAutoSaveTimerRef.current);
    reservationAutoSaveTimerRef.current = null;
    if (!await persistFloorReservationDetails()) return;
    dismissReservationDetails();
  }

  const floorReservationEditKey = reservationEditDraft
    ? floorReservationDraftKey(reservationEditDraft)
    : "";

  useEffect(() => {
    if (!focusedReservation || !reservationEditDraft || !floorReservationEditKey || saving) return;
    if (floorReservationEditKey === reservationSavedDraftKeyRef.current) return;
    if (floorReservationEditKey === reservationFailedDraftKeyRef.current) return;
    if (reservationAutoSaveTimerRef.current) clearTimeout(reservationAutoSaveTimerRef.current);
    reservationAutoSaveTimerRef.current = setTimeout(() => {
      reservationAutoSaveTimerRef.current = null;
      void persistFloorReservationDetails();
    }, RESERVATION_AUTO_SAVE_DELAY);
    return () => {
      if (reservationAutoSaveTimerRef.current) clearTimeout(reservationAutoSaveTimerRef.current);
    };
  }, [floorReservationEditKey, focusedReservation, persistFloorReservationDetails, reservationEditDraft, saving]);

  function captureFloorEditorSnapshot(
    tables = editedTables,
    deletedIds = deletedTableIds,
    selectedIds = editorSelectedTableIds,
  ): FloorEditorSnapshot {
    return {
      tables: tables.map((table) => ({ ...table })),
      deletedTableIds: [...deletedIds],
      selectedTableIds: [...selectedIds],
    };
  }

  function sameFloorEditorDocument(left: FloorEditorSnapshot, right: FloorEditorSnapshot) {
    return JSON.stringify(left.tables) === JSON.stringify(right.tables)
      && JSON.stringify(left.deletedTableIds) === JSON.stringify(right.deletedTableIds);
  }

  function restoreFloorEditorSnapshot(snapshot: FloorEditorSnapshot) {
    setEditedTables(snapshot.tables.map((table) => ({ ...table })));
    setDeletedTableIds([...snapshot.deletedTableIds]);
    setEditorSelectedTableIds([...snapshot.selectedTableIds]);
    setDeleteConfirmationIds([]);
    setError("");
  }

  function commitFloorEditorSnapshot(snapshot: FloorEditorSnapshot) {
    const current = captureFloorEditorSnapshot();
    if (sameFloorEditorDocument(current, snapshot)) return;
    setFloorUndoStack((history) => [...history, current]);
    setFloorRedoStack([]);
    restoreFloorEditorSnapshot(snapshot);
  }

  function undoFloorEditorChange() {
    const previous = floorUndoStack.at(-1);
    if (!previous) return;
    const current = captureFloorEditorSnapshot();
    setFloorUndoStack((history) => history.slice(0, -1));
    setFloorRedoStack((history) => [...history, current]);
    restoreFloorEditorSnapshot(previous);
  }

  function redoFloorEditorChange() {
    const next = floorRedoStack.at(-1);
    if (!next) return;
    const current = captureFloorEditorSnapshot();
    setFloorRedoStack((history) => history.slice(0, -1));
    setFloorUndoStack((history) => [...history, current]);
    restoreFloorEditorSnapshot(next);
  }

  function beginFloorEditing() {
    if (!data) return;
    setError("");
    cancelSeating();
    closeReservationDetails();
    setSelectedPendingId(null);
    setEditedTables(data.tables.map((table) => ({ ...table })));
    setEditorSelectedTableIds([]);
    setDeletedTableIds([]);
    setFloorUndoStack([]);
    setFloorRedoStack([]);
    setDeleteConfirmationIds([]);
    setEditingFloor(true);
  }

  function cancelFloorEditing() {
    setError("");
    setEditingFloor(false);
    setEditedTables([]);
    setEditorSelectedTableIds([]);
    setDeletedTableIds([]);
    setFloorUndoStack([]);
    setFloorRedoStack([]);
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
    const nextTables = editedTables.map((table) =>
      editorSelectedTableIds.includes(table.id) ? { ...table, ...patch } : table,
    );
    commitFloorEditorSnapshot(captureFloorEditorSnapshot(nextTables));
  }

  function alignSelectedTables() {
    if (editorSelectedTables.length < 2) return;
    const row = Math.round(
      editorSelectedTables.reduce((total, table) => total + table.position_y, 0)
      / editorSelectedTables.length,
    );
    updateEditorSelection({ position_y: row });
  }

  function alignSelectedTablesVertically() {
    if (editorSelectedTables.length < 2) return;
    const column = Math.round(
      editorSelectedTables.reduce((total, table) => total + table.position_x, 0)
      / editorSelectedTables.length,
    );
    updateEditorSelection({ position_x: column });
  }

  function spaceSelectedTables() {
    if (editorSelectedTables.length < 2) return;
    const stage = floorStageRef.current;
    if (!stage) return;
    const elementsById = new Map(
      Array.from(stage.querySelectorAll<HTMLElement>("[data-floor-table-id]"))
        .map((element) => [Number(element.dataset.floorTableId), element]),
    );
    const ordered = editorSelectedTables
      .map((table) => {
        const element = elementsById.get(table.id);
        return element ? { table, bounds: floorTableVisualBounds(element) } : null;
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((left, right) => left.bounds.left - right.bounds.left);
    if (ordered.length < 2) return;
    const groupLeft = Math.min(...ordered.map((item) => item.bounds.left));
    const groupRight = Math.max(...ordered.map((item) => item.bounds.right));
    const occupiedWidth = ordered.reduce(
      (total, item) => total + item.bounds.right - item.bounds.left,
      0,
    );
    const gap = (groupRight - groupLeft - occupiedWidth) / (ordered.length - 1);
    const stageWidth = stage.getBoundingClientRect().width;
    let nextLeft = groupLeft;
    const positions = new Map<number, number>();
    ordered.forEach(({ table, bounds }) => {
      const deltaPercent = ((nextLeft - bounds.left) / stageWidth) * 100;
      positions.set(table.id, Math.round((table.position_x + deltaPercent) * 100) / 100);
      nextLeft += bounds.right - bounds.left + gap;
    });
    const nextTables = editedTables.map((table) =>
      positions.has(table.id) ? { ...table, position_x: positions.get(table.id) as number } : table,
    );
    commitFloorEditorSnapshot(captureFloorEditorSnapshot(nextTables));
  }

  function spaceSelectedTablesVertically() {
    if (editorSelectedTables.length < 2) return;
    const stage = floorStageRef.current;
    if (!stage) return;
    const elementsById = new Map(
      Array.from(stage.querySelectorAll<HTMLElement>("[data-floor-table-id]"))
        .map((element) => [Number(element.dataset.floorTableId), element]),
    );
    const ordered = editorSelectedTables
      .map((table) => {
        const element = elementsById.get(table.id);
        return element ? { table, bounds: floorTableVisualBounds(element) } : null;
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((top, bottom) => top.bounds.top - bottom.bounds.top);
    if (ordered.length < 2) return;
    const groupTop = Math.min(...ordered.map((item) => item.bounds.top));
    const groupBottom = Math.max(...ordered.map((item) => item.bounds.bottom));
    const occupiedHeight = ordered.reduce(
      (total, item) => total + item.bounds.bottom - item.bounds.top,
      0,
    );
    const gap = (groupBottom - groupTop - occupiedHeight) / (ordered.length - 1);
    const stageHeight = stage.getBoundingClientRect().height;
    let nextTop = groupTop;
    const positions = new Map<number, number>();
    ordered.forEach(({ table, bounds }) => {
      const deltaPercent = ((nextTop - bounds.top) / stageHeight) * 100;
      positions.set(table.id, Math.round((table.position_y + deltaPercent) * 100) / 100);
      nextTop += bounds.bottom - bounds.top + gap;
    });
    const nextTables = editedTables.map((table) =>
      positions.has(table.id) ? { ...table, position_y: positions.get(table.id) as number } : table,
    );
    commitFloorEditorSnapshot(captureFloorEditorSnapshot(nextTables));
  }

  function autoPolishFloor() {
    const stage = floorStageRef.current;
    if (!stage || editedTables.length < 2) return;
    const elementsById = new Map(
      Array.from(stage.querySelectorAll<HTMLElement>("[data-floor-table-id]"))
        .map((element) => [Number(element.dataset.floorTableId), element]),
    );
    const measured = editedTables.map((table) => {
      const element = elementsById.get(table.id);
      if (!element) return null;
      const bounds = floorTableVisualBounds(element);
      return {
        table,
        bounds,
        centerX: (bounds.left + bounds.right) / 2,
        centerY: (bounds.top + bounds.bottom) / 2,
      };
    }).filter((item): item is MeasuredFloorTable => item !== null);
    if (measured.length < 2) return;

    const stageBounds = stage.getBoundingClientRect();
    const targetX = polishedAxisCenters(measured, "x", stageBounds.left, stageBounds.right);
    const targetY = polishedAxisCenters(measured, "y", stageBounds.top, stageBounds.bottom);
    const measuredById = new Map(measured.map((item) => [item.table.id, item]));
    const nextTables = editedTables.map((table) => {
      const item = measuredById.get(table.id);
      if (!item) return table;
      const xDelta = ((targetX.get(table.id)! - item.centerX) / stageBounds.width) * 100;
      const yDelta = ((targetY.get(table.id)! - item.centerY) / stageBounds.height) * 100;
      return {
        ...table,
        position_x: Math.round(clamp(table.position_x + xDelta, 0, 100) * 100) / 100,
        position_y: Math.round(clamp(table.position_y + yDelta, 0, 100) * 100) / 100,
      };
    });
    const proposedBounds = nextTables.flatMap((table) => {
      const original = measuredById.get(table.id);
      if (!original) return [];
      const dx = (table.position_x - original.table.position_x) * stageBounds.width / 100;
      const dy = (table.position_y - original.table.position_y) * stageBounds.height / 100;
      return [{
        name: table.name,
        left: original.bounds.left + dx,
        right: original.bounds.right + dx,
        top: original.bounds.top + dy,
        bottom: original.bounds.bottom + dy,
      }];
    });
    const outsideTables = proposedBounds.filter((bounds) =>
      bounds.left < stageBounds.left || bounds.right > stageBounds.right
      || bounds.top < stageBounds.top || bounds.bottom > stageBounds.bottom);
    const overlapPairs = proposedBounds.flatMap((bounds, index) =>
      proposedBounds.slice(index + 1)
        .filter((other) => floorTableBoundsOverlap(bounds, other))
        .map((other) => `${bounds.name} and ${other.name}`));
    if (outsideTables.length || overlapPairs.length) {
      const reasons = [];
      if (overlapPairs.length) {
        reasons.push(`overlap table pairs ${overlapPairs.slice(0, 3).join("; ")}${overlapPairs.length > 3 ? ` (and ${overlapPairs.length - 3} more pairs)` : ""}`);
      }
      if (outsideTables.length) {
        reasons.push(`move tables ${outsideTables.map((table) => table.name).join(", ")} outside the floor`);
      }
      setError(`Auto polish was not applied: the proposed positions would ${reasons.join(" and ")}. Your current layout is unchanged. Try aligning or spacing smaller groups.`);
      return;
    }
    setError("");
    commitFloorEditorSnapshot(captureFloorEditorSnapshot(nextTables));
  }

  function rotateSelectedTables(amount: number) {
    if (!editorSelectedTableIds.length) return;
    const nextTables = editedTables.map((table) => editorSelectedTableIds.includes(table.id)
      ? { ...table, rotation: (table.rotation + amount + 360) % 360 }
      : table);
    commitFloorEditorSnapshot(captureFloorEditorSnapshot(nextTables));
  }

  function cloneSelectedTables() {
    if (!editorSelectedTables.length) return;
    const selected = [...editorSelectedTables].sort((left, right) =>
      left.sort_order - right.sort_order || left.id - right.id);
    const usedNames = new Set(
      editedTables
        .map((table) => table.name.trim())
        .filter(Boolean)
        .map((name) => name.toLocaleLowerCase()),
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
      name: nextAvailableTableName(table.name, usedNames),
      sort_order: nextSortOrder + index,
      position_x: clamp(table.position_x + horizontalShift, 0, 100),
      position_y: clamp(table.position_y + verticalShift, 0, 100),
      clone_source_id: table.is_new ? undefined : table.clone_source_id ?? table.id,
      is_new: table.is_new,
    }));
    commitFloorEditorSnapshot(captureFloorEditorSnapshot(
      [...editedTables, ...clones],
      deletedTableIds,
      clones.map((table) => table.id),
    ));
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
    commitFloorEditorSnapshot(captureFloorEditorSnapshot(
      [...editedTables, table],
      deletedTableIds,
      [table.id],
    ));
  }

  function deleteSelectedTables() {
    if (!editorSelectedTableIds.length) return;
    if (!deleteSelectionConfirmed) {
      setDeleteConfirmationIds([...editorSelectedTableIds]);
      return;
    }
    const selectedIds = new Set(editorSelectedTableIds);
    const nextDeletedTableIds = [
      ...new Set([
        ...deletedTableIds,
        ...editorSelectedTableIds.filter((id) => id > 0),
      ]),
    ];
    commitFloorEditorSnapshot(captureFloorEditorSnapshot(
      editedTables.filter((table) => !selectedIds.has(table.id)),
      nextDeletedTableIds,
      [],
    ));
  }

  function beginTableMove(event: ReactPointerEvent<HTMLButtonElement>, tableId: number) {
    if (!editingFloor || event.button !== 0) return;
    if ((event.shiftKey || event.metaKey) && !editorSelectedTableIds.includes(tableId)) {
      return;
    }
    const selectedIds = editorSelectedTableIds.includes(tableId)
      ? editorSelectedTableIds
      : [tableId];
    const stage = floorStageRef.current;
    if (!stage) return;
    const tableElements = Array.from(stage.querySelectorAll<HTMLElement>("[data-floor-table-id]"));
    const selectedElements = tableElements
      .filter((element) => selectedIds.includes(Number(element.dataset.floorTableId)));
    if (!selectedElements.length) return;
    const selectedRects = selectedElements.map(floorTableVisualBounds);
    const selectedBounds = {
      left: Math.min(...selectedRects.map((bounds) => bounds.left)),
      right: Math.max(...selectedRects.map((bounds) => bounds.right)),
      top: Math.min(...selectedRects.map((bounds) => bounds.top)),
      bottom: Math.max(...selectedRects.map((bounds) => bounds.bottom)),
    };
    const stageBounds = stage.getBoundingClientRect();
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
      minimumDeltaX: stageBounds.left - selectedBounds.left,
      maximumDeltaX: stageBounds.right - selectedBounds.right,
      minimumDeltaY: stageBounds.top - selectedBounds.top,
      maximumDeltaY: stageBounds.bottom - selectedBounds.bottom,
      initialSnapshot: captureFloorEditorSnapshot(
        editedTables,
        deletedTableIds,
        selectedIds,
      ),
      latestTables: editedTables,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveSelectedTables(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = floorTableDragRef.current;
    const stage = floorStageRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !stage) return;
    const rawDeltaX = event.clientX - drag.startX;
    const rawDeltaY = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(rawDeltaX, rawDeltaY) > 3) {
      drag.moved = true;
      setMovingEditorTables(true);
    }
    if (!drag.moved) return;
    const stageBounds = stage.getBoundingClientRect();
    const deltaX = clamp(rawDeltaX, drag.minimumDeltaX, drag.maximumDeltaX);
    const deltaY = clamp(rawDeltaY, drag.minimumDeltaY, drag.maximumDeltaY);
    const xPercent = (deltaX / stageBounds.width) * 100;
    const yPercent = (deltaY / stageBounds.height) * 100;
    const origins = new Map(drag.origins.map((origin) => [origin.id, origin]));
    setEditedTables((current) => {
      const nextTables = current.map((table) => {
      const origin = origins.get(table.id);
      return origin ? {
        ...table,
        position_x: Math.round((origin.positionX + xPercent) * 100) / 100,
        position_y: Math.round((origin.positionY + yPercent) * 100) / 100,
      } : table;
      });
      drag.latestTables = nextTables;
      return nextTables;
    });
  }

  function finishTableMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = floorTableDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    suppressEditorClickRef.current = drag.moved;
    const completedSnapshot = captureFloorEditorSnapshot(
      drag.latestTables,
      deletedTableIds,
      drag.initialSnapshot.selectedTableIds,
    );
    if (drag.moved && !sameFloorEditorDocument(drag.initialSnapshot, completedSnapshot)) {
      setFloorUndoStack((history) => [...history, drag.initialSnapshot]);
      setFloorRedoStack([]);
    }
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
    if (
      !editingFloor
      || event.button !== 0
      || (event.target as HTMLElement).closest("[data-floor-table-id]")
    ) return;
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
    if (floorHasInvalidCapacity) {
      setError("Minimum guests must be between 1 and maximum guests.");
      return;
    }
    if (floorHasInvalidTableNumbers) {
      setError("Every table needs a unique table number before the floor can be saved.");
      return;
    }
    const stage = floorStageRef.current;
    if (stage && floorTableOverlapIds(stage).size > 0) {
      setError("Tables cannot overlap. Move the overlapping tables apart before saving the floor.");
      return;
    }
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
            name: table.name.trim(),
            capacity: table.capacity,
            min_capacity: table.min_capacity ?? 1,
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
            min_capacity: table.min_capacity ?? 1,
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
            name: table.name.trim(),
            capacity: table.capacity,
            min_capacity: table.min_capacity ?? 1,
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
    closeReservationDetails();
    writeServiceUrl(value, shiftSlug || data?.selected_shift.slug || "dinner");
    setServiceDate(value);
  }

  function chooseShift(value: string) {
    if (editingFloor) return;
    cancelSeating();
    setSelectedPendingId(null);
    closeReservationDetails();
    setSelectedServerId(null);
    writeServiceUrl(serviceDate, value);
    setShiftSlug(value);
  }

  async function saveServerAssignment(server: ServerAssignment, updates: Pick<ServerAssignment, "table_ids" | "section_ids">) {
    if (!data || saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(appPath(`/api/settings/servers/${server.id}/assignments/${data.selected_shift.id}`), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(updates),
      });
      const payload = (await response.json()) as ServerAssignment | Record<string, unknown>;
      if (!response.ok) throw new Error(readError(payload));
      const updated = payload as ServerAssignment;
      setData((current) => current ? {
        ...current,
        servers: current.servers.map((item) => item.id === updated.id
          ? updated
          : {
              ...item,
              table_ids: item.table_ids.filter((tableId) => !updated.table_ids.includes(tableId)),
            }),
      } : current);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update this server's tables.");
    } finally {
      setSaving(false);
    }
  }

  function toggleServerTable(tableId: number) {
    if (!selectedServer) return;
    void saveServerAssignment(selectedServer, {
      table_ids: selectedServer.table_ids.includes(tableId)
        ? selectedServer.table_ids.filter((id) => id !== tableId)
        : [...selectedServer.table_ids, tableId],
      section_ids: selectedServer.section_ids,
    });
  }

  function toggleServerSection(sectionId: number) {
    if (!selectedServer) return;
    void saveServerAssignment(selectedServer, {
      table_ids: selectedServer.table_ids,
      section_ids: selectedServer.section_ids.includes(sectionId)
        ? selectedServer.section_ids.filter((id) => id !== sectionId)
        : [...selectedServer.section_ids, sectionId],
    });
  }

  function jumpToNow() {
    if (editingFloor) return;
    cancelSeating();
    setSelectedPendingId(null);
    closeReservationDetails();
    const now = new Date();
    const closest = closestServiceOccurrence(data?.shifts || [], now);
    const currentDate = data?.current_service_date || closest?.date || localDateValue(now);
    const currentShift = closest?.shiftSlug || data?.selected_shift.slug || shiftSlug || "dinner";
    writeServiceUrl(currentDate, currentShift);
    setServiceDate(currentDate);
    setShiftSlug(currentShift);
  }

  async function updateReservation(
    reservation: Reservation,
    updates: ReservationUpdate,
  ) {
    if (!liveService && updates.status !== undefined && SERVICE_LIFECYCLE_STATUSES.includes(updates.status)) return false;
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
      if (updates.status === "complete") closeReservationDetails();
      setSelectedPendingId(null);
      await loadFloor();
      if (focusedReservationId === reservation.id) void loadReservationActivity(reservation.id);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update the reservation.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function openTableStatus(event: ReactMouseEvent<HTMLButtonElement>, reservation: Reservation, table: DiningTable) {
    const position = statusPopoverPosition(event.currentTarget);
    setStatusPopover((current) => current?.reservationId === reservation.id && current.tableName === table.name
      ? null
      : { reservationId: reservation.id, tableName: table.name, ...position });
  }

  async function updateTableStatus(reservation: Reservation, status: ServiceStatus) {
    if (!SERVICE_LIFECYCLE_STATUSES.includes(status)) return;
    const updated = await updateReservation(reservation, { status });
    if (updated) setStatusPopover(null);
  }

  function seatAtTable(reservation: Reservation, table: DiningTable) {
    if (activeByTable.has(table.id) || !liveService) return;
    void updateReservation(reservation, {
      table_ids: [table.id],
      status: WAITING_STATUSES.includes(reservation.status) ? "seated" : reservation.status,
    });
  }

  function toggleSeatingTable(tableId: number) {
    setSelectedTableIds((current) =>
      current.includes(tableId)
        ? current.filter((selectedId) => selectedId !== tableId)
        : [...current, tableId],
    );
  }

  function beginTableReassignment(reservation: Reservation) {
    setSelectedPendingId(reservation.id);
    closeReservationDetails();
    setWalkInDraft(null);
    setSelectedTableIds(
      reservation.table_ids.length
        ? reservation.table_ids
        : reservation.table_id === null ? [] : [reservation.table_id],
    );
    setSeatingMode("reassignment");
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

  function toggleWalkInTag(value: string) {
    setWalkInTags((current) => (
      current.includes(value) ? current.filter((tag) => tag !== value) : [...current, value]
    ));
  }

  function addWalkInTag() {
    const value = walkInTagInput.trim();
    if (value && !walkInTags.includes(value)) {
      setWalkInTags((current) => [...current, value]);
    }
    setWalkInTagInput("");
  }

  function continueWalkIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!Number.isInteger(walkInPartySize) || walkInPartySize < 1 || walkInPartySize > 40) return;
    const pendingTag = walkInTagInput.trim();
    setWalkInDraft({
      partySize: walkInPartySize,
      durationMinutes: walkInDurationMinutes,
      guestId: walkInSelectedGuest?.id || null,
      guestName: walkInSelectedGuest?.full_name || walkInGuestQuery.trim(),
      notes: walkInNotes.trim(),
      tags: pendingTag && !walkInTags.includes(pendingTag) ? [...walkInTags, pendingTag] : walkInTags,
    });
    setSelectedPendingId(null);
    setSelectedTableIds([]);
    setSeatingMode("walk-in");
    setWalkInOpen(false);
  }

  function openFloorBlock(tableId?: number) {
    setFloorBlockTableIds(tableId ? [tableId] : []);
    setFloorBlockStartTime(data?.selected_shift.start_time || "");
    setFloorBlockScope("turn");
    setFloorBlockNotes("");
    setFloorBlockOpen(true);
  }

  async function createFloorBlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data || !floorBlockTableIds.length || !floorBlockStartTime) return;
    setSaving(true);
    setError("");
    try {
      const remaining = minutes(data.selected_shift.end_time) - minutes(floorBlockStartTime);
      const duration = floorBlockScope === "shift" ? remaining : Math.min(data.selected_shift.default_turn_minutes, remaining);
      const response = await fetch(appPath("/api/grid/blocks"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ service_date: serviceDate, shift_slug: data.selected_shift.slug, table_ids: floorBlockTableIds, start_time: floorBlockStartTime, duration_minutes: duration, notes: floorBlockNotes.trim() }) });
      const payload = await response.json() as TableBlock | Record<string, unknown>;
      if (!response.ok) throw new Error(readError(payload));
      setData((current) => current ? { ...current, blocks: [...(current.blocks || []), payload as TableBlock] } : current);
      setFloorBlockOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to block these tables.");
    } finally { setSaving(false); }
  }

  async function seatOrFinish() {
    if (!seatingMode) {
      if (!selectedPending) return;
      closeReservationDetails();
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
        status: WAITING_STATUSES.includes(selectedPending.status) ? "seated" : selectedPending.status,
      });
      if (completed) cancelSeating();
      return;
    }

    if (seatingMode === "reassignment" && selectedPending) {
      const completed = await updateReservation(selectedPending, { table_ids: selectedTableIds });
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
            duration_minutes: walkInDraft.durationMinutes,
            notes: walkInDraft.notes,
            tags: walkInDraft.tags,
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
        <div className={`floor-page${editingFloor ? " editing-floor-page" : ""}`}>
          {!editingFloor && <header className="grid-toolbar floor-grid-toolbar" aria-label="Floor plan controls">
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
              <button className="now-button" type="button" onClick={jumpToNow} aria-label="Go to the closest service now">
                <Clock3 aria-hidden="true" />
              </button>
            </div>
            <div className="floor-toolbar-spacer" aria-hidden="true" />
          </header>}

          {error && <div className="grid-alert floor-alert" role="alert">{error}</div>}
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
                  <article
                    key={reservation.id}
                    draggable={liveService && !seatingMode}
                    className={`floor-reservation-card${selectedPendingId === reservation.id ? " selected" : ""}${reservation.is_unassigned ? " unassigned" : ""}`}
                    onDragStart={() => {
                      if (seatingMode) return;
                      closeReservationDetails();
                      setDraggedReservationId(reservation.id);
                      setSelectedPendingId(reservation.id);
                    }}
                    onDragEnd={() => {
                      setDraggedReservationId(null);
                      setDropTargetTableId(null);
                    }}
                  >
                    <button
                      type="button"
                      className="floor-reservation-select"
                      onClick={() => {
                        if (!seatingMode) {
                          setSelectedPendingId((current) => current === reservation.id ? null : reservation.id);
                          openReservationDetails(reservation);
                        }
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
                    </button>
                    <span className="floor-reservation-tail">
                      {reservation.is_unassigned ? (
                        <button
                          type="button"
                          className="floor-reservation-unassigned"
                          onClick={() => beginTableReassignment(reservation)}
                          aria-label={`Assign a table to ${reservation.guest_name}`}
                        >
                          <TriangleAlert aria-hidden="true" />
                          <strong>Unassigned</strong>
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={`floor-reservation-table${overlappingReservationIds.has(reservation.id) ? " has-turn-conflict" : ""}`}
                          onClick={() => beginTableReassignment(reservation)}
                          aria-label={`Reassign ${reservation.guest_name} from ${reservation.table_names.length > 1 ? "Tables" : "Table"} ${(reservation.table_names.length ? reservation.table_names : [reservation.table_name]).join(", ")}`}
                        >
                          <small>{reservation.table_names.length > 1 ? "Tables" : "Table"}</small>
                          <strong>{displayTableAssignment(reservation.table_names.length ? reservation.table_names : [reservation.table_name])}</strong>
                        </button>
                      )}
                      {liveService && <GripVertical className="floor-reservation-move-indicator" aria-hidden="true" />}
                    </span>
                  </article>
                )) : (
                  <div className="floor-empty"><Check aria-hidden="true" /><strong>All caught up</strong><span>No pending parties for this shift.</span></div>
                )}
              </div>
              {seatingMode && (
                <div className={`floor-seating-prompt${seatingCapacityWarning ? " is-capacity-warning" : ""}`} role="status">
                  <strong>
                    {seatingMode === "walk-in"
                      ? `${walkInDraft?.guestName || "Walk-in"} · Party of ${walkInDraft?.partySize} · ${formatTurnTime(walkInDraft?.durationMinutes ?? walkInDurationMinutes)} turn`
                      : selectedPending?.guest_name}
                  </strong>
                  {seatingMode === "walk-in" && walkInDraft && (walkInDraft.tags.length > 0 || walkInDraft.notes) && (
                    <span>
                      {[
                        walkInDraft.tags.length > 0 ? `Tags: ${walkInDraft.tags.join(", ")}` : "",
                        walkInDraft.notes ? `Note: ${walkInDraft.notes}` : "",
                      ].filter(Boolean).join(" · ")}
                    </span>
                  )}
                  <span>
                    {seatingMode === "reassignment"
                      ? "Select one or more available tables, then save the assignment."
                      : "Select one or more available tables, then finish seating."}
                  </span>
                  {seatingCapacityWarning && (
                    <span className="floor-seating-capacity-warning" role="alert">
                      Capacity warning: {selectedSeatingCapacity} seats selected for a party of {seatingPartySize}. You can still finish seating.
                    </span>
                  )}
                </div>
              )}
              <div className="floor-reservation-actions">
                <button
                  type="button"
                  className="floor-seat-action"
                  onClick={() => void seatOrFinish()}
                  disabled={
                    saving
                    || (!liveService && seatingMode !== "reassignment")
                    || (!seatingMode && !selectedPending)
                    || (Boolean(seatingMode) && selectedTableIds.length === 0)
                  }
                >
                  {seatingMode === "reassignment" ? "Save Table Assignment" : seatingMode ? "Finish Seating" : "Seat"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWalkInOpen(true);
                    setWalkInPartySize(2);
                    setWalkInCustomPartySize("");
                    setWalkInDurationMinutes(data?.selected_shift.default_turn_minutes || 90);
                    setWalkInGuestQuery("");
                    setWalkInNotes("");
                    setWalkInTags([]);
                    setWalkInTagInput("");
                    setWalkInSelectedGuest(null);
                    setWalkInGuestResults([]);
                  }}
                  disabled={saving || !liveService || Boolean(seatingMode)}
                >
                  Walk In
                </button>
                <button type="button" onClick={() => openFloorBlock()} disabled={saving || !data?.booking_allowed || Boolean(seatingMode)}>Block Tables</button>
                {seatingMode && (
                  <button type="button" className="floor-cancel-seating" onClick={cancelSeating}>
                    Cancel
                  </button>
                )}
              </div>
            </aside>

            <section className="floor-plan-panel" aria-label="Restaurant floor plan">
              {!editingFloor && <div className="floor-plan-heading">
                <div>
                  <span>Dining room</span>
                  <h2>{data?.restaurant.name || "Floor"}</h2>
                </div>
                <div className="floor-plan-actions">
                  <span><strong>{activeByTable.size}</strong> of {data?.tables.length || 0} occupied</span>
                  <details ref={viewMenuRef} className="floor-view-menu">
                    <summary role="button" aria-label="View">
                      <Eye aria-hidden="true" /> View <ChevronRight aria-hidden="true" />
                    </summary>
                    <div className="floor-view-menu-options" aria-label="Floor view options">
                      <span>Show on floor</span>
                      <label>
                        <input
                          type="checkbox"
                          checked={showReservationTimes}
                          onChange={(event) => setShowReservationTimes(event.currentTarget.checked)}
                        />
                        Reservation times
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={showFloorTimes}
                          onChange={(event) => {
                            if (event.currentTarget.checked) setFloorClock(Date.now());
                            setShowFloorTimes(event.currentTarget.checked);
                          }}
                        />
                        Floor times
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={showSectionOutlines}
                          onChange={(event) => setShowSectionOutlines(event.currentTarget.checked)}
                        />
                        Section outlines
                      </label>
                    </div>
                  </details>
                  <button
                    type="button"
                    className="floor-edit-trigger"
                    onClick={() => {
                      setShowReservationTimes(false);
                      setShowSectionOutlines(true);
                      setShowFloorTimes(false);
                      beginFloorEditing();
                    }}
                    disabled={saving || editingFloor}
                  >
                    <PencilRuler aria-hidden="true" /> {editingFloor ? "Editing Floor" : "Edit Floor"}
                  </button>
                </div>
              </div>}

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
                    <div className="floor-editor-tool-group" aria-label="Floor change history">
                      <span>History</span>
                      <button
                        type="button"
                        onClick={undoFloorEditorChange}
                        disabled={!floorUndoStack.length || saving}
                        aria-label="Undo last floor change"
                      >
                        <Undo2 aria-hidden="true" /> Undo
                      </button>
                      <button
                        type="button"
                        onClick={redoFloorEditorChange}
                        disabled={!floorRedoStack.length || saving}
                        aria-label="Redo last floor change"
                      >
                        <Redo2 aria-hidden="true" /> Redo
                      </button>
                    </div>
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
                      <button type="button" onClick={alignSelectedTablesVertically} disabled={editorSelectedTables.length < 2}>
                        <Columns3 aria-hidden="true" /> Align column
                      </button>
                      <button type="button" onClick={spaceSelectedTables} disabled={editorSelectedTables.length < 2}>
                        <AlignHorizontalSpaceAround aria-hidden="true" /> Equal horizontal
                      </button>
                      <button type="button" onClick={spaceSelectedTablesVertically} disabled={editorSelectedTables.length < 2}>
                        <AlignVerticalSpaceAround aria-hidden="true" /> Equal vertical
                      </button>
                      <button type="button" onClick={autoPolishFloor} disabled={editedTables.length < 2 || saving} title="Align and evenly space the entire floor plan">
                        <Sparkles aria-hidden="true" /> Auto polish
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
                        Table number
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={40}
                          value={selectedEditorTable?.name ?? ""}
                          placeholder={editorSelectedTables.length > 1 ? "Select one" : "No table"}
                          disabled={!selectedEditorTable}
                          aria-invalid={selectedEditorTable ? duplicateTableNumberIds.has(selectedEditorTable.id) || missingTableNumberIds.has(selectedEditorTable.id) : undefined}
                          aria-describedby={floorHasInvalidTableNumbers ? "floor-table-number-error" : undefined}
                          onChange={(event) => updateEditorSelection({ name: event.target.value })}
                        />
                      </label>
                      <label>
                        Min guests
                        <input
                          type="number"
                          min={1}
                          max={40}
                          value={editorValues?.minCapacity ?? ""}
                          placeholder="Mixed"
                          disabled={!editorValues}
                          onChange={(event) => {
                            if (event.target.value) updateEditorSelection({ min_capacity: Number(event.target.value) });
                          }}
                          onBlur={(event) => updateEditorSelection({ min_capacity: clamp(Number(event.target.value), 1, 40) })}
                        />
                      </label>
                      <label>
                        Max guests
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
                          min={20}
                          max={220}
                          value={editorValues?.width ?? ""}
                          placeholder="Mixed"
                          disabled={!editorValues}
                          onChange={(event) => {
                            if (event.target.value) updateEditorSelection({ width: Number(event.target.value) });
                          }}
                          onBlur={(event) => updateEditorSelection({ width: clamp(Number(event.target.value), 20, 220) })}
                        />
                      </label>
                      <label>
                        Height
                        <input
                          type="number"
                          min={20}
                          max={180}
                          value={editorValues?.height ?? ""}
                          placeholder="Mixed"
                          disabled={!editorValues}
                          onChange={(event) => {
                            if (event.target.value) updateEditorSelection({ height: Number(event.target.value) });
                          }}
                          onBlur={(event) => updateEditorSelection({ height: clamp(Number(event.target.value), 20, 180) })}
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
                    {floorHasInvalidCapacity && <small className="floor-editor-validation" role="alert">Minimum guests must be between 1 and maximum guests.</small>}
                    {(floorHasInvalidTableNumbers || floorHasOverlappingTables) && (
                      <small id="floor-table-number-error" className="floor-editor-validation" role="alert">
                        <TriangleAlert aria-hidden="true" />
                        {floorHasOverlappingTables
                          ? "Overlapping tables must be moved apart before saving."
                          : duplicateTableNumberIds.size > 0
                            ? "Duplicate table numbers must be changed."
                            : "Every table needs a number."}
                      </small>
                    )}
                    <button type="button" onClick={cancelFloorEditing} disabled={saving}>Cancel</button>
                    <button type="button" className="floor-editor-save" onClick={() => void saveFloorLayout()} disabled={saving || floorHasInvalidCapacity || floorHasInvalidTableNumbers || floorHasOverlappingTables}>
                      {saving ? <LoaderCircle className="spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
                      {saving ? "Saving…" : "Save Floor"}
                    </button>
                  </div>
                </section>
              )}

              <div
                ref={floorCanvasRef}
                className={`floor-canvas${seatingMode ? " assigning seating" : ""}${editingFloor ? " editing" : ""}${showReservationTimes ? " show-reservation-times" : ""}${movingEditorTables ? " moving-tables" : ""}${floorMarqueeBounds ? " selecting-tables" : ""}`}
                style={editingFloor ? {
                  minHeight: `${floorStageMetrics.height * floorStageMetrics.scale}px`,
                } : undefined}
                onPointerDown={beginFloorMarquee}
                onPointerMove={updateFloorMarquee}
                onPointerUp={finishFloorMarquee}
                onPointerCancel={finishFloorMarquee}
              >
                <div
                  ref={floorStageRef}
                  className="floor-canvas-stage"
                  style={{
                    width: `${floorStageMetrics.width}px`,
                    height: `${floorStageMetrics.height}px`,
                    transform: `scale(${floorStageMetrics.scale})`,
                  }}
                >
                  {showSectionOutlines && sectionOverlays.length > 0 && (
                    <svg
                      className="floor-section-overlays"
                      viewBox={`0 0 ${floorStageMetrics.width} ${floorStageMetrics.height}`}
                      aria-label="Floor sections"
                    >
                      {sectionOverlays.map(({ section, color, shape }) => shape && (
                        <g key={section.id} className="floor-section-overlay" style={{ "--section-color": color } as CSSProperties}>
                          {shape.connectors.map((path, index) => <path key={index} className="floor-section-connector" d={path} />)}
                          {shape.paths.map((path, index) => <path key={index} d={path} />)}
                          <rect x={shape.labelX - 9} y={shape.labelY - 18} width={shape.labelWidth} height="24" rx="12" />
                          <text x={shape.labelX} y={shape.labelY}>{section.name}</text>
                        </g>
                      ))}
                    </svg>
                  )}
                  {loading && !data ? (
                    <div className="floor-canvas-loading"><LoaderCircle className="spin" aria-hidden="true" /> Loading tables…</div>
                  ) : displayedTables.map((table) => {
                  const reservation = activeByTable.get(table.id);
                  const assignedServer = serverByTable.get(table.id);
                  const scheduledReservations = scheduledReservationsByTable.get(table.id) || [];
                  const floorTurn = showFloorTimes && liveService && reservation
                    ? turnProgress(reservation, floorClock)
                    : null;
                  const floorTurnState = floorTurn?.expired
                    ? "expired"
                    : floorTurn && floorTurn.remainingPercent <= 25
                      ? "warning"
                      : "on-track";
                  const floorTurnDash = floorTurn?.expired ? floorTurn.overduePercent : floorTurn?.remainingPercent;
                  const available = !reservation;
                  const label = tableLabelPresentation(table.width, table.height, floorStageMetrics.scale, table.name);
                  const editorSelected = editorSelectedTableIds.includes(table.id);
                  const duplicateTableNumber = editingFloor && duplicateTableNumberIds.has(table.id);
                  const missingTableNumber = editingFloor && missingTableNumberIds.has(table.id);
                  return (
                    <button
                      type="button"
                      key={table.id}
                      data-floor-table-id={table.id}
                      className={`floor-table floor-table-${table.shape}${available ? " available" : ` occupied status-${reservation.status}`}${dropTargetTableId === table.id ? " drop-target" : ""}${selectedTableIds.includes(table.id) ? " seat-selected" : ""}${editorSelected ? " editor-selected" : ""}${duplicateTableNumber ? " duplicate-number" : ""}${missingTableNumber ? " missing-number" : ""}${overlappingTableIds.has(table.id) ? " overlapping-table" : ""}${assignedServer ? " server-assigned" : ""}${selectedServer ? " assigning-server" : ""}`}
                      style={{
                        left: `${table.position_x}%`,
                        top: `${table.position_y}%`,
                        width: `${table.width}px`,
                        height: `${table.height}px`,
                        "--table-rotation": `${table.rotation}deg`,
                        "--table-label-rotation": `${-table.rotation}deg`,
                        "--server-color": assignedServer?.color,
                      } as CSSProperties}
                      onClick={(event) => {
                        if (editingFloor) {
                          selectEditorTable(table.id, event.shiftKey || event.metaKey);
                        } else if (selectedServer) {
                          toggleServerTable(table.id);
                        } else if (seatingMode) {
                          if (seatingMode === "reassignment" || !reservation || reservation.id === selectedPending?.id) {
                            toggleSeatingTable(table.id);
                          }
                        } else if (reservation) {
                          openTableStatus(event, reservation, table);
                        } else {
                          setAvailableTablePopover({ tableId: table.id, tableName: table.name, ...statusPopoverPosition(event.currentTarget) });
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
                      title={`Table ${table.name}, ${table.capacity} ${table.capacity === 1 ? "seat" : "seats"}${showReservationTimes && scheduledReservations.length ? `, reservations at ${scheduledReservations.map((item) => displayTime(item.start_time)).join(", ")}` : reservation ? `, ${reservation.guest_name}, ${statusLabel(reservation.status)}` : ""}${floorTurn ? floorTurn.expired ? ", expected turn time reached" : `, ${floorTurn.remainingMinutes} minutes remaining in expected turn` : ""}`}
                      aria-label={editingFloor
                          ? `Table ${table.name || "without a number"}, ${table.capacity} seats, ${table.shape}, ${editorSelected ? "selected" : "not selected"}${duplicateTableNumber ? ", duplicate table number" : ""}${overlappingTableIds.has(table.id) ? ", overlaps another table" : ""}`
                        : seatingMode === "reassignment" && reservation
                          ? `Table ${table.name}, currently assigned to ${reservation.guest_name}${selectedTableIds.includes(table.id) ? ", selected for reassignment" : ", not selected for reassignment"}`
                          : showReservationTimes && scheduledReservations.length
                            ? `Table ${table.name}, reservations at ${scheduledReservations.map((item) => displayTime(item.start_time)).join(", ")}${floorTurn ? floorTurn.expired ? ", expected turn time reached" : `, ${floorTurn.remainingMinutes} minutes remaining in expected turn` : ""}${selectedTableIds.includes(table.id) ? ", selected for seating" : ""}`
                          : reservation
                          ? `Table ${table.name}, ${reservation.guest_name}, ${statusLabel(reservation.status)}${floorTurn ? floorTurn.expired ? ", expected turn time reached" : `, ${floorTurn.remainingMinutes} minutes remaining in expected turn` : ""}`
                          : `Table ${table.name}, available, seats ${table.capacity}${selectedTableIds.includes(table.id) ? ", selected for seating" : ""}`}
                    >
                      {chairPositions(table).map((style, index) => (
                        <i key={index} className="chair" style={style} aria-hidden="true" />
                      ))}
                      <span className="floor-table-surface" aria-hidden="true" />
                      {floorTurn && floorTurnDash !== undefined && (
                        <svg
                          className={`floor-table-turn-timer ${floorTurnState}`}
                          viewBox="0 0 100 100"
                          preserveAspectRatio="none"
                          aria-hidden="true"
                          style={{
                            "--turn-dash": `${floorTurnDash} ${100 - floorTurnDash}`,
                            "--turn-countdown-duration": `${floorTurn.remainingMilliseconds}ms`,
                            "--turn-overdue-duration": `${floorTurn.overdueRemainingMilliseconds}ms`,
                          } as CSSProperties}
                        >
                          <path d={floorTimerPath(table.shape, floorTurn.expired)} pathLength="100" />
                        </svg>
                      )}
                      <span
                        className={`floor-table-label floor-table-label-${label.density}`}
                        style={{ "--table-number-size": `${label.numberSize}px` } as CSSProperties}
                      >
                        <strong>{table.name}</strong>
                        {showReservationTimes && scheduledReservations.length ? (
                          <span className="floor-table-reservation-times">
                            {scheduledReservations.map((item) => <time key={item.id} dateTime={item.start_time}>{displayTime(item.start_time)}</time>)}
                          </span>
                        ) : reservation ? (
                          <>
                            <small className="floor-table-guest">{reservation.guest_name}</small>
                            <em>{statusLabel(reservation.status)}</em>
                          </>
                        ) : (
                          <><small>{(table.min_capacity ?? 1) > 1 && table.min_capacity !== table.capacity ? `${table.min_capacity}–` : ""}{table.capacity} seats</small><em>{duplicateTableNumber ? "Duplicate number" : missingTableNumber ? "Number required" : editingFloor ? `${table.rotation}°` : "Available"}</em></>
                        )}
                      </span>
                    </button>
                  );
                  })}
                  {data && data.tables.length === 0 && (
                    <div className="floor-canvas-loading">
                      <CirclePlus aria-hidden="true" />
                      {editingFloor ? "Use New Table to create the first table." : "Choose Edit Floor to create the first table."}
                    </div>
                  )}
                </div>
                {floorMarqueeBounds && (
                  <div className="floor-selection-marquee" style={floorMarqueeBounds} aria-hidden="true" />
                )}
              </div>
              {!editingFloor && <div className="floor-server-controls">
                <details ref={serversMenuRef} className="floor-servers-menu">
                  <summary role="button" aria-label="Servers">
                    <Users aria-hidden="true" /> Servers
                    {selectedServer && <span className="floor-server-chip" style={{ "--server-color": selectedServer.color } as CSSProperties}>{selectedServer.name}</span>}
                  </summary>
                  <div className="floor-servers-menu-options" aria-label="Servers assigned to this shift">
                    <p>{data?.servers.length ? "Choose a server, then click tables to assign them. Click that server's table again to remove it; choose another server to switch it." : "Assign servers to this shift in Settings first."}</p>
                    {data?.servers.map((server) => <button key={server.id} type="button" className={selectedServerId === server.id ? "selected" : ""} onClick={() => setSelectedServerId((current) => current === server.id ? null : server.id)}><i style={{ backgroundColor: server.color }} aria-hidden="true" />{server.name}<span>{selectedServerId === server.id ? "Assigning" : "Assign"}</span></button>)}
                    {selectedServer && data?.sections.length ? <fieldset><legend>Or assign whole sections to {selectedServer.name}</legend>{data.sections.map((section) => <label key={section.id}><input type="checkbox" checked={selectedServer.section_ids.includes(section.id)} disabled={saving} onChange={() => toggleServerSection(section.id)} /> {section.name}</label>)}</fieldset> : null}
                  </div>
                </details>
              </div>}

              {statusPopover && popoverReservation && (() => {
                const turn = turnProgress(popoverReservation, floorClock);
                const seatedAt = popoverReservation.seated_at
                  ? new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(popoverReservation.seated_at))
                  : "Not recorded";
                const remaining = turn?.expired
                  ? `${formatTurnTime(turn.overdueMinutes)} over`
                  : turn ? `${formatTurnTime(turn.remainingMinutes)} left` : "—";
                return (
                  <div
                    ref={statusPopoverRef}
                    className={styles.popover}
                    role="dialog"
                    aria-label={`Service status for ${popoverReservation.guest_name}`}
                    style={{ left: statusPopover.left, top: statusPopover.top }}
                  >
                    <div className={styles.header}>
                      <div>
                        <span className={styles.eyebrow}>Table {statusPopover.tableName} · {popoverReservation.party_size} {popoverReservation.party_size === 1 ? "guest" : "guests"}</span>
                        <h2 className={styles.guest}>{popoverReservation.guest_name || "Walk-in"}</h2>
                      </div>
                      <button type="button" className={styles.close} onClick={() => setStatusPopover(null)} aria-label="Close table status"><X aria-hidden="true" /></button>
                    </div>
                    <div className={styles.summary}>
                      <div><span>Seated</span><strong>{seatedAt}</strong></div>
                      <div><span>Expected turn</span><strong>{formatTurnTime(popoverReservation.duration_minutes)}</strong></div>
                      <div><span>Time remaining</span><strong className={turn?.expired ? styles.warning : undefined}>{remaining}</strong></div>
                      <div><span>Current status</span><strong>{statusLabel(popoverReservation.status)}</strong></div>
                    </div>
                    <div className={styles.steps} aria-label="Service status actions">
                      {SERVICE_STEPS.map((step) => {
                        const StepIcon = step.icon;
                        const current = step.value === popoverReservation.status;
                        return (
                          <button
                            type="button"
                            key={step.value}
                            className={`${styles.step} ${styles[`status-${step.value}`]}${current ? ` ${styles.current}` : ""}`}
                            aria-pressed={current}
                            disabled={saving || !liveService || current}
                            // This handler runs after the click; it does not read a ref during render.
                            // eslint-disable-next-line react-hooks/refs
                            onClick={() => void updateTableStatus(popoverReservation, step.value)}
                          >
                            <StepIcon aria-hidden="true" />
                            <span>{step.label}</span>
                          </button>
                        );
                      })}
                    </div>
                    <button type="button" className={styles.details} onClick={() => {
                      setStatusPopover(null);
                      // This handler runs after the click; it does not read a ref during render.
                      // eslint-disable-next-line react-hooks/refs
                      openReservationDetails(popoverReservation);
                    }}>Open reservation details</button>
                  </div>
                );
              })()}
              {availableTablePopover && (
                <div ref={statusPopoverRef} className={styles.popover} role="dialog" aria-label={`Actions for table ${availableTablePopover.tableName}`} style={{ left: availableTablePopover.left, top: availableTablePopover.top }}>
                  <div className={styles.header}><div><span className={styles.eyebrow}>Table {availableTablePopover.tableName}</span><h2 className={styles.guest}>Available</h2></div><button type="button" className={styles.close} onClick={() => setAvailableTablePopover(null)} aria-label="Close table actions"><X aria-hidden="true" /></button></div>
                  <button type="button" className={styles.details} onClick={() => { openFloorBlock(availableTablePopover.tableId); setAvailableTablePopover(null); }}>Block table</button>
                </div>
              )}

              {focusedReservation && reservationEditDraft && (
                <aside className={`floor-reservation-detail-card${reservationDetailClosing ? " is-closing" : ""}`} aria-label={`Reservation details for ${focusedReservation.guest_name}`} aria-hidden={reservationDetailClosing}>
                  <form onSubmit={(event) => event.preventDefault()}>
                    <header>
                      <div>
                        <span>Reservation details</span>
                        <h2>Edit reservation</h2>
                      </div>
                      <button type="button" className="floor-dock-close" onClick={closeReservationDetails} aria-label="Close reservation details"><X aria-hidden="true" /></button>
                    </header>
                    <div className="floor-reservation-edit-grid">
                      <label>
                        Guest name
                        <input
                          type="text"
                          value={reservationEditDraft.guestName}
                          onChange={(event) => setReservationEditDraft((current) => current && ({ ...current, guestName: event.target.value }))}
                          maxLength={180}
                          required
                        />
                      </label>
                      <div className="floor-reservation-status-field">
                        <span>Status</span>
                        <details ref={reservationStatusMenuRef} className="floor-reservation-status-menu">
                          <summary role="button" aria-label="Status" aria-disabled={saving || (!liveService && SERVICE_LIFECYCLE_STATUSES.includes(focusedReservation.status))} onClick={(event) => {
                            if (saving || (!liveService && SERVICE_LIFECYCLE_STATUSES.includes(focusedReservation.status))) event.preventDefault();
                          }}>
                            {FocusedStatusIcon && <FocusedStatusIcon aria-hidden="true" />}
                            <strong>{focusedStatusOption?.label || statusLabel(reservationEditDraft.status)}</strong>
                            <ChevronRight aria-hidden="true" />
                          </summary>
                          <div role="listbox" aria-label="Reservation status options">
                            {statusOptionsFor(focusedReservation.status).map((option) => {
                              const StatusIcon = option.icon;
                              const selected = option.value === reservationEditDraft.status;
                              return (
                                <button type="button" role="option" aria-selected={selected} key={option.value} onClick={() => {
                                  setReservationEditDraft((current) => current && ({ ...current, status: option.value }));
                                  reservationStatusMenuRef.current?.removeAttribute("open");
                                }}>
                                  <StatusIcon aria-hidden="true" />
                                  <span>{option.label}</span>
                                  {selected && <Check aria-hidden="true" />}
                                </button>
                              );
                            })}
                          </div>
                        </details>
                      </div>
                      <label>
                        Time
                        <input
                          type="time"
                          step={900}
                          value={reservationEditDraft.startTime}
                          onChange={(event) => setReservationEditDraft((current) => current && ({ ...current, startTime: event.target.value }))}
                          required
                        />
                      </label>
                      <div className="floor-reservation-turn-field">
                        <span>Turn time</span>
                        <div className="floor-reservation-stepper">
                          <button type="button" aria-label="Decrease turn time" onClick={() => adjustReservationTurnTime(-15)} disabled={Number(reservationEditDraft.durationMinutes) <= 15}><Minus aria-hidden="true" /></button>
                          <input aria-label="Turn time" value={formatTurnTime(Number(reservationEditDraft.durationMinutes))} readOnly />
                          <button type="button" aria-label="Increase turn time" onClick={() => adjustReservationTurnTime(15)} disabled={Number(reservationEditDraft.durationMinutes) >= 360}><Plus aria-hidden="true" /></button>
                        </div>
                      </div>
                      <div className="floor-reservation-party-size floor-reservation-detail-wide">
                        <fieldset className="party-size-picker">
                          <legend>Party size</legend>
                          <div className="party-size-options">
                            {PARTY_SIZE_PRESETS.map((size) => (
                              <button type="button" key={size} className={Number(reservationEditDraft.partySize) === size ? "selected" : ""} aria-label={`Party size ${size}`} aria-pressed={Number(reservationEditDraft.partySize) === size} onClick={() => setReservationPartySize(size)}>{size}</button>
                            ))}
                          </div>
                        </fieldset>
                        <div className="party-size-manual">
                          <span id="reservation-manual-party-size-label">Enter party size</span>
                          <div className={`party-size-manual-control${Number(reservationEditDraft.partySize) >= 9 ? " selected" : ""}`}>
                            <button type="button" aria-label="Decrease party size" onClick={() => adjustReservationPartySize(-1)} disabled={Number(reservationEditDraft.partySize) <= 9}><Minus aria-hidden="true" /></button>
                            <input type="number" min={9} max={MAX_PARTY_SIZE} inputMode="numeric" placeholder="9" value={Number(reservationEditDraft.partySize) >= 9 ? reservationEditDraft.partySize : ""} aria-labelledby="reservation-manual-party-size-label" onFocus={() => Number(reservationEditDraft.partySize) < 9 && setReservationPartySize(9)} onChange={(event) => setReservationPartySize(event.currentTarget.value)} />
                            <button type="button" aria-label="Increase party size" onClick={() => adjustReservationPartySize(1)} disabled={Number(reservationEditDraft.partySize) >= MAX_PARTY_SIZE}><Plus aria-hidden="true" /></button>
                          </div>
                          <span className="party-size-manual-hint">9 or more guests</span>
                        </div>
                      </div>
                      <div className="floor-reservation-table-edit floor-reservation-detail-wide">
                        <span>
                          <small>{focusedReservation.table_names.length > 1 ? "Tables" : "Table"}</small>
                          <strong>{(focusedReservation.table_names.length ? focusedReservation.table_names : [focusedReservation.table_name]).join(" + ") || "Unassigned"}</strong>
                        </span>
                        <button type="button" onClick={() => beginTableReassignment(focusedReservation)}>Reassign tables</button>
                      </div>
                      <section className="floor-reservation-metadata-panel reservation-detail-section">
                        <div className="booking-detail-section-heading"><Tag aria-hidden="true" /><div><h3>This reservation</h3><p>Saved only for this visit.</p></div></div>
                        <fieldset className="tag-picker">
                          <legend>Reservation tags</legend>
                          <div className="tag-options">
                            {[...RESERVATION_TAGS, ...reservationEditDraft.reservationTags.filter((tag) => !RESERVATION_TAGS.includes(tag))].map((tag) => {
                              const selected = reservationEditDraft.reservationTags.includes(tag);
                              return <button type="button" key={tag} className={selected ? "selected" : ""} aria-pressed={selected} onClick={() => toggleReservationEditTag("reservationTags", tag)}><TagIcon tag={tag} /><span>{tag}</span><Check className={selected ? "tag-selected-check" : "tag-selected-check tag-check-placeholder"} aria-hidden="true" /></button>;
                            })}
                          </div>
                        </fieldset>
                        <label>Reservation notes<textarea rows={4} value={reservationEditDraft.reservationNotes} onChange={(event) => setReservationEditDraft((current) => current && ({ ...current, reservationNotes: event.target.value }))} maxLength={5000} placeholder="Occasion, seating request, accessibility…" /></label>
                      </section>
                      <section className="floor-reservation-metadata-panel guest-detail-section">
                        <div className="booking-detail-section-heading"><Users aria-hidden="true" /><div><h3>Guest profile</h3><p>Persists for this guest on future visits.</p></div></div>
                        <fieldset className="tag-picker">
                          <legend>Guest tags</legend>
                          <div className="tag-options">
                            {[...GUEST_TAGS, ...reservationEditDraft.guestTags.filter((tag) => !GUEST_TAGS.includes(tag))].map((tag) => {
                              const selected = reservationEditDraft.guestTags.includes(tag);
                              return <button type="button" key={tag} className={selected ? "selected" : ""} aria-pressed={selected} onClick={() => toggleReservationEditTag("guestTags", tag)}><TagIcon tag={tag} /><span>{tag}</span><Check className={selected ? "tag-selected-check" : "tag-selected-check tag-check-placeholder"} aria-hidden="true" /></button>;
                            })}
                          </div>
                        </fieldset>
                        <label>Guest notes<textarea rows={4} value={reservationEditDraft.guestNotes} onChange={(event) => setReservationEditDraft((current) => current && ({ ...current, guestNotes: event.target.value }))} maxLength={5000} placeholder="Preferences to remember for future visits…" /></label>
                      </section>
                      <section className="floor-reservation-activity floor-reservation-detail-wide" aria-label="Reservation activity history">
                        <div className="booking-detail-section-heading"><Clock3 aria-hidden="true" /><div><h3>Activity history</h3><p>Every booking, change, move, and status update.</p></div></div>
                        {activityLoading ? (
                          <p>Loading history…</p>
                        ) : activityEvents.length ? (
                          <ol>
                            {activityEvents.map((activity) => (
                              <li key={activity.id}>
                                <span>{activity.summary}</span>
                                <time dateTime={activity.created_at}>{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(activity.created_at))}</time>
                              </li>
                            ))}
                          </ol>
                        ) : (
                          <p>No activity recorded yet.</p>
                        )}
                      </section>
                    </div>
                    <footer className="floor-reservation-detail-actions">
                      <span className="reservation-auto-save-status" role="status">
                        {saving ? "Saving changes…" : reservationAutoSaveError ? (
                          <>
                            <span>{reservationAutoSaveError}</span>
                            <button type="button" onClick={() => {
                              reservationFailedDraftKeyRef.current = "";
                              void persistFloorReservationDetails();
                            }}>Retry</button>
                          </>
                        ) : "Changes save automatically."}
                      </span>
                    </footer>
                  </form>
                </aside>
              )}
            </section>
          </div>

          {walkInOpen && (
            <div className="floor-dialog-backdrop" role="presentation" onMouseDown={(event) => {
              if (event.target === event.currentTarget) setWalkInOpen(false);
            }}>
              <form className="floor-dialog floor-walk-in-dialog" onSubmit={continueWalkIn} aria-labelledby="walk-in-title">
                <button type="button" className="floor-dialog-close" onClick={() => setWalkInOpen(false)} aria-label="Close walk-in"><X aria-hidden="true" /></button>
                <h2 id="walk-in-title">Walk In</h2>
                <fieldset className="floor-party-size-picker">
                  <legend>Party size</legend>
                  <div className="floor-party-size-options">
                    {Array.from({ length: 8 }, (_, index) => index + 1).map((partySize) => (
                      <button
                        type="button"
                        key={partySize}
                        className={walkInCustomPartySize === "" && walkInPartySize === partySize ? "selected" : ""}
                        aria-pressed={walkInCustomPartySize === "" && walkInPartySize === partySize}
                        onClick={() => {
                          setWalkInPartySize(partySize);
                          setWalkInCustomPartySize("");
                        }}
                        autoFocus={partySize === 2}
                      >
                        {partySize}
                      </button>
                    ))}
                    <input
                      type="number"
                      min={9}
                      max={40}
                      step={1}
                      inputMode="numeric"
                      aria-label="Party size 9 or more"
                      aria-describedby={walkInCustomPartySize !== "" && (walkInPartySize < 9 || walkInPartySize > 40 || !Number.isInteger(walkInPartySize)) ? "walk-in-party-size-error" : undefined}
                      aria-invalid={walkInCustomPartySize !== "" && (walkInPartySize < 9 || walkInPartySize > 40 || !Number.isInteger(walkInPartySize))}
                      className={walkInCustomPartySize !== "" && Number.isInteger(walkInPartySize) && walkInPartySize >= 9 && walkInPartySize <= 40 ? "selected" : ""}
                      placeholder="9+"
                      value={walkInCustomPartySize}
                      onChange={(event) => {
                        const value = event.target.value;
                        setWalkInCustomPartySize(value);
                        setWalkInPartySize(value === "" ? 2 : Number(value));
                      }}
                    />
                  </div>
                  {walkInCustomPartySize !== "" && (walkInPartySize < 9 || walkInPartySize > 40 || !Number.isInteger(walkInPartySize)) && (
                    <small id="walk-in-party-size-error" className="floor-party-size-error" role="alert">Enter a whole-number party size from 9 to 40.</small>
                  )}
                </fieldset>
                <label>
                  Expected turn
                  <select
                    value={walkInDurationMinutes}
                    onChange={(event) => setWalkInDurationMinutes(Number(event.target.value))}
                  >
                    {[...new Set([...WALK_IN_TURN_TIMES, walkInDurationMinutes])]
                      .sort((left, right) => left - right)
                      .map((minutes) => <option key={minutes} value={minutes}>{formatTurnTime(minutes)}</option>)}
                  </select>
                </label>
                <label>
                  Guest name <small>Optional</small>
                  <span className="floor-guest-search-field">
                    <Search aria-hidden="true" />
                    <input
                      value={walkInGuestQuery}
                      onChange={(event) => {
                        const value = event.target.value;
                        setWalkInGuestQuery(value);
                        setWalkInSelectedGuest(null);
                        if (value.trim().length < 2) {
                          setWalkInGuestResults([]);
                          setGuestSearchLoading(false);
                        }
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
                {!walkInSelectedGuest && walkInGuestQuery.trim().length >= 2 && (
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
                <label>
                  Reservation note <small>Optional</small>
                  <textarea
                    rows={2}
                    maxLength={5000}
                    value={walkInNotes}
                    onChange={(event) => setWalkInNotes(event.target.value)}
                    placeholder="Occasion, seating request, accessibility…"
                  />
                </label>
                <fieldset className="tag-picker floor-walk-in-tags">
                  <legend><Tag aria-hidden="true" /> Reservation tags <small>Optional</small></legend>
                  <div className="tag-options">
                    {WALK_IN_RESERVATION_TAGS.map((tag) => (
                      <button
                        type="button"
                        key={tag}
                        className={walkInTags.includes(tag) ? "selected" : ""}
                        aria-pressed={walkInTags.includes(tag)}
                        onClick={() => toggleWalkInTag(tag)}
                      >
                        <TagIcon tag={tag} />
                        <span>{tag}</span>
                        <Check className={walkInTags.includes(tag) ? "tag-selected-check" : "tag-selected-check tag-check-placeholder"} aria-hidden="true" />
                      </button>
                    ))}
                    {walkInTags.filter((tag) => !WALK_IN_RESERVATION_TAGS.includes(tag)).map((tag) => (
                      <button
                        type="button"
                        key={tag}
                        className="selected"
                        aria-pressed="true"
                        onClick={() => toggleWalkInTag(tag)}
                      >
                        <TagIcon tag={tag} />
                        <span>{tag}</span>
                        <Check className="tag-selected-check" aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                  <div className="custom-tag">
                    <input
                      maxLength={40}
                      value={walkInTagInput}
                      onChange={(event) => setWalkInTagInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addWalkInTag();
                        }
                      }}
                      placeholder="Add a reservation tag"
                      aria-label="Custom reservation tag"
                    />
                    <button type="button" onClick={addWalkInTag} disabled={!walkInTagInput.trim()}>Add</button>
                  </div>
                </fieldset>
                <button
                  type="submit"
                  className="floor-dialog-submit"
                  disabled={!Number.isInteger(walkInPartySize) || walkInPartySize < 1 || walkInPartySize > 40 || (walkInCustomPartySize !== "" && walkInPartySize < 9)}
                >
                  Continue to tables
                </button>
              </form>
            </div>
          )}
          {floorBlockOpen && data && (
            <div className="floor-dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setFloorBlockOpen(false)}>
              <form className="floor-dialog" onSubmit={createFloorBlock} aria-labelledby="floor-block-title">
                <button type="button" className="floor-dialog-close" onClick={() => setFloorBlockOpen(false)} aria-label="Close table block"><X aria-hidden="true" /></button>
                <h2 id="floor-block-title">Block tables</h2>
                <p>Select one or more tables. Blocks never create a guest record.</p>
                <label>Start time<input type="time" step={900} min={data.selected_shift.start_time} max={data.selected_shift.end_time} value={floorBlockStartTime} onChange={(event) => setFloorBlockStartTime(event.target.value)} required /></label>
                <fieldset className="table-block-scope"><legend>Duration</legend><label><input type="radio" checked={floorBlockScope === "turn"} onChange={() => setFloorBlockScope("turn")} /> Next turn · {formatTurnTime(data.selected_shift.default_turn_minutes)}</label><label><input type="radio" checked={floorBlockScope === "shift"} onChange={() => setFloorBlockScope("shift")} /> Rest of shift</label></fieldset>
                <fieldset className="floor-block-tables"><legend>Tables</legend>{data.tables.map((table) => <label key={table.id}><input type="checkbox" checked={floorBlockTableIds.includes(table.id)} onChange={() => setFloorBlockTableIds((current) => current.includes(table.id) ? current.filter((id) => id !== table.id) : [...current, table.id])} /> Table {table.name}</label>)}</fieldset>
                <label>Block notes<textarea value={floorBlockNotes} onChange={(event) => setFloorBlockNotes(event.target.value)} maxLength={5000} placeholder="Why are these tables blocked?" /></label>
                <button className="floor-dialog-submit" type="submit" disabled={saving || !floorBlockTableIds.length}>{saving ? "Blocking…" : "Confirm block"}</button>
              </form>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
