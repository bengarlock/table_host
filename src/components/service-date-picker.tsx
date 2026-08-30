"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useRef, useState } from "react";

type ServiceDatePickerProps = {
  value: string;
  onChange: (value: string) => void;
  fieldLabel?: string;
  useRelativeLabel?: boolean;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parseDate(value: string) {
  return new Date(`${value}T12:00:00`);
}

function dateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function todayLocal() {
  return dateValue(new Date());
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(parseDate(value));
}

function monthLabel(date: Date) {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(date);
}

function calendarDays(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12);
  const gridStart = new Date(first);
  gridStart.setDate(1 - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return date;
  });
}

export function ServiceDatePicker({
  value,
  onChange,
  fieldLabel = "Service date",
  useRelativeLabel = true,
}: ServiceDatePickerProps) {
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => parseDate(value));
  const shellRef = useRef<HTMLDivElement>(null);

  function toggleCalendar() {
    if (!open) setVisibleMonth(parseDate(value));
    setOpen((current) => !current);
  }

  function moveMonth(amount: number) {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1, 12));
  }

  return (
    <div
      className={`date-picker-shell${open ? " open" : ""}`}
      ref={shellRef}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setOpen(false);
          shellRef.current?.querySelector<HTMLButtonElement>(".date-picker-trigger")?.focus();
        }
      }}
    >
      <button
        type="button"
        className="date-picker-trigger"
        onClick={toggleCalendar}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${fieldLabel}: ${dateLabel(value)}`}
      >
        <CalendarDays aria-hidden="true" />
        <span>{useRelativeLabel && value === todayLocal() ? "Today" : dateLabel(value)}</span>
      </button>

      {open && (
        <div className="calendar-popover" role="dialog" aria-label={`Choose ${fieldLabel.toLowerCase()}`}>
          <div className="calendar-header">
            <button type="button" onClick={() => moveMonth(-1)} aria-label="Previous month">
              <ChevronLeft aria-hidden="true" />
            </button>
            <strong>{monthLabel(visibleMonth)}</strong>
            <button type="button" onClick={() => moveMonth(1)} aria-label="Next month">
              <ChevronRight aria-hidden="true" />
            </button>
          </div>
          <div className="calendar-weekdays" aria-hidden="true">
            {WEEKDAYS.map((day) => <span key={day}>{day.slice(0, 1)}</span>)}
          </div>
          <div className="calendar-days">
            {calendarDays(visibleMonth).map((date) => {
              const dateString = dateValue(date);
              const outsideMonth = date.getMonth() !== visibleMonth.getMonth();
              return (
                <button
                  type="button"
                  key={dateString}
                  className={`${outsideMonth ? "outside-month " : ""}${dateString === value ? "selected " : ""}${dateString === todayLocal() ? "today" : ""}`.trim()}
                  onClick={() => {
                    onChange(dateString);
                    setOpen(false);
                  }}
                  aria-label={dateLabel(dateString)}
                  aria-current={dateString === todayLocal() ? "date" : undefined}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
