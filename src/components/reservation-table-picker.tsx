"use client";

import { Check, LoaderCircle, X } from "lucide-react";
import { CSSProperties, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  reservationOverlaps,
  reservationsByTable,
  ReservationFloorBooking,
} from "@/lib/reservation-table-availability";

export type ReservationFloorTable = {
  id: number;
  name: string;
  capacity: number;
  shape: "rectangle" | "round";
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  rotation: number;
  chair_layout: "wrap" | "across" | "across_horizontal";
};

type ReservationTablePickerProps = {
  tables: ReservationFloorTable[];
  reservations: ReservationFloorBooking[];
  selectedTableIds: number[];
  partySize: number;
  startTime: string;
  durationMinutes: number;
  shifts: Array<{
    id: number;
    name: string;
    slug: string;
    start_time: string;
    end_time: string;
  }>;
  selectedShiftSlug: string;
  timeOptions: Array<{
    start_time: string;
    available: boolean;
  }>;
  loading: boolean;
  onShiftChange: (shiftSlug: string) => void;
  onTimeChange: (startTime: string) => void;
  onToggleTable: (tableId: number) => void;
  onClose: () => void;
  onConfirm: () => void;
};

const FLOOR_STAGE_WIDTH = 1200;
const FLOOR_STAGE_HEIGHT = 560;

function displayTime(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
}

function displayTurnTime(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  const hourLabel = hour % 12 || 12;
  const minuteLabel = minute ? `:${String(minute).padStart(2, "0")}` : "";
  return `${hourLabel}${minuteLabel}${hour >= 12 ? "PM" : "AM"}`;
}

function chairPositions(table: ReservationFloorTable): CSSProperties[] {
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

export function ReservationTablePicker({
  tables,
  reservations,
  selectedTableIds,
  partySize,
  startTime,
  durationMinutes,
  shifts,
  selectedShiftSlug,
  timeOptions,
  loading,
  onShiftChange,
  onTimeChange,
  onToggleTable,
  onClose,
  onConfirm,
}: ReservationTablePickerProps) {
  const floorViewportRef = useRef<HTMLDivElement>(null);
  const [floorScale, setFloorScale] = useState(1);
  const bookingsByTable = useMemo(() => reservationsByTable(reservations), [reservations]);

  const selectedTables = tables.filter((table) => selectedTableIds.includes(table.id));
  const selectedCapacity = selectedTables.reduce((total, table) => total + table.capacity, 0);
  const hasEnoughSeats = selectedCapacity >= partySize;

  useLayoutEffect(() => {
    const viewport = floorViewportRef.current;
    if (!viewport) return;

    function fitFloorToViewport() {
      if (!viewport) return;
      const nextScale = Math.min(
        viewport.clientWidth / FLOOR_STAGE_WIDTH,
        viewport.clientHeight / FLOOR_STAGE_HEIGHT,
        1,
      );
      setFloorScale(Math.max(0, Number(nextScale.toFixed(4))));
    }

    fitFloorToViewport();
    const observer = new ResizeObserver(fitFloorToViewport);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className="reservation-table-picker-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <section className="reservation-table-picker" role="dialog" aria-modal="true" aria-labelledby="assign-tables-title">
        <header>
          <div>
            <span>Floor availability · {displayTime(startTime)}</span>
            <h3 id="assign-tables-title">Assign tables</h3>
            <p>Select one or multiple available tables for this party.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close table assignment" autoFocus><X aria-hidden="true" /></button>
        </header>

        <div className="reservation-table-picker-controls">
          <label>
            Shift
            <select value={selectedShiftSlug} onChange={(event) => onShiftChange(event.currentTarget.value)} disabled={loading}>
              {shifts.map((shift) => (
                <option key={shift.id} value={shift.slug}>
                  {shift.name} · {displayTime(shift.start_time)}–{displayTime(shift.end_time)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Reservation time
            <select value={startTime} onChange={(event) => onTimeChange(event.currentTarget.value)} disabled={loading}>
              {timeOptions.map((option) => (
                <option key={option.start_time} value={option.start_time}>
                  {displayTime(option.start_time)}{option.available ? "" : " · limited availability"}
                </option>
              ))}
            </select>
          </label>
          {loading && <span className="reservation-table-picker-loading"><LoaderCircle className="spin" aria-hidden="true" /> Updating floor…</span>}
        </div>

        <div className="reservation-table-picker-legend" aria-label="Table availability legend">
          <span><i className="available" />Available</span>
          <span><i className="selected" />Selected</span>
          <span><i className="flexible" />Flexible booking</span>
          <span><i className="booked" />Fixed booking</span>
        </div>

        <div className="reservation-assignment-floor" ref={floorViewportRef}>
          <div
            className="reservation-assignment-stage-shell"
            style={{
              width: `${FLOOR_STAGE_WIDTH * floorScale}px`,
              height: `${FLOOR_STAGE_HEIGHT * floorScale}px`,
            }}
          >
            <div className="reservation-assignment-stage" style={{ transform: `scale(${floorScale})` }}>
              {tables.map((table) => {
                const tableBookings = bookingsByTable.get(table.id) || [];
                const conflicts = tableBookings.filter((booking) => (
                  reservationOverlaps(booking, startTime, durationMinutes)
                ));
                const hardConflict = conflicts.find((booking) => booking.assignment_type === "hard");
                const hasFlexibleConflict = conflicts.some((booking) => booking.assignment_type === "soft");
                const selected = selectedTableIds.includes(table.id);
                const visibleTurns = tableBookings.slice(0, 3);
                const turnLabels = visibleTurns.map((booking) => displayTurnTime(booking.start_time));
                return (
                  <button
                    type="button"
                    key={table.id}
                    className={`floor-table floor-table-${table.shape}${hardConflict ? " occupied reservation-booked" : hasFlexibleConflict ? " available reservation-flexible-conflict" : " available"}${tableBookings.length ? " reservation-has-turns" : ""}${selected ? " seat-selected" : ""}`}
                    style={{
                      left: `${table.position_x}%`,
                      top: `${table.position_y}%`,
                      width: `${table.width}px`,
                      height: `${table.height}px`,
                      "--table-rotation": `${table.rotation}deg`,
                      "--table-label-rotation": `${-table.rotation}deg`,
                    } as CSSProperties}
                    aria-pressed={selected}
                    aria-label={`Table ${table.name}, ${table.capacity} seats${turnLabels.length ? `, reservations at ${turnLabels.join(", ")}` : ""}${hardConflict ? ", fixed reservation at the selected time" : hasFlexibleConflict ? ", flexible reservation will be reflowed if selected" : ", available at the selected time"}${selected ? ", selected" : ""}`}
                    onClick={() => onToggleTable(table.id)}
                  >
                    {chairPositions(table).map((style, index) => <i key={index} className="chair" style={style} aria-hidden="true" />)}
                    <span className="floor-table-surface" aria-hidden="true" />
                    <span className="floor-table-label">
                      <strong>{table.name}</strong>
                      {turnLabels.length ? (
                        <span className="reservation-turn-times">
                          {visibleTurns.map((booking) => <em key={booking.id}>{displayTurnTime(booking.start_time)}</em>)}
                        </span>
                      ) : (
                        <><small>{table.capacity} seats</small><em>{selected ? "Selected" : "Available"}</em></>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <footer>
          <div aria-live="polite">
            <strong>{selectedTables.length || "No"} table{selectedTables.length === 1 ? "" : "s"} selected</strong>
            <span>{selectedCapacity} of {partySize} seats assigned</span>
          </div>
          <button type="button" className="reservation-table-cancel" onClick={onClose}>Cancel</button>
          <button type="button" className="reservation-table-confirm" onClick={onConfirm} disabled={!hasEnoughSeats}>
            <Check aria-hidden="true" /> Assign selected tables
          </button>
        </footer>
      </section>
    </div>
  );
}
