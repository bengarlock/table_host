"use client";

import {
  ArrowLeft,
  ArrowRightLeft,
  ArrowRight,
  Building2,
  Check,
  LayoutGrid,
  LoaderCircle,
  Mail,
  Minus,
  Phone,
  Plus,
  Search,
  Tag,
  Users,
  UserPlus,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { PhoneInput } from "@/components/phone-input";
import {
  ReservationFloorTable,
  ReservationTablePicker,
} from "@/components/reservation-table-picker";
import { ServiceDatePicker } from "@/components/service-date-picker";
import { appPath } from "@/lib/app-paths";
import { IGNORE_AUTOFILL } from "@/lib/autofill";
import { capitalizeNameInitial } from "@/lib/guest-names";
import { ReservationFloorBooking } from "@/lib/reservation-table-availability";

type AvailabilityOption = {
  service_date: string;
  shift_slug: string;
  shift_name: string;
  start_time: string;
  table_id: number | null;
  table_name: string | null;
  table_capacity: number | null;
  available: boolean;
  unavailable_reason: string;
};

type AvailabilityResponse = {
  options: AvailabilityOption[];
};

type AssignmentGridResponse = {
  tables: ReservationFloorTable[];
  reservations: ReservationFloorBooking[];
};

type BookingWizardProps = {
  initialDate: string;
  initialShiftSlug: string;
  initialDuration: number;
  shifts: ShiftChoice[];
  onClose: () => void;
  onBooked: (serviceDate: string, shiftSlug: string) => void;
  presentation?: "modal" | "page";
};

type ShiftChoice = {
  id: number;
  name: string;
  slug: string;
  start_time: string;
  end_time: string;
};

type GuestRecord = {
  id: number;
  first_name: string;
  last_name: string;
  full_name: string;
  phone_number: string;
  email: string;
  company: string;
  guest_notes: string;
  tags: string[];
};

type GuestSearchResponse = {
  results: GuestRecord[];
};

type BookingDetails = {
  reservationNotes: string;
  guestNotes: string;
};

type NewGuest = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  company: string;
};

type NewGuestFocus = "firstName" | "lastName" | "phone";

const RESERVATION_TAGS = ["Birthday", "Anniversary", "First visit", "Business meal", "Special occasion", "Accessibility"];
const GUEST_TAGS = ["VIP", "Regular", "Local", "Hotel guest", "Concierge", "Accessibility"];
const PARTY_SIZE_PRESETS = [1, 2, 3, 4, 5, 6, 7, 8];

function normalizeTurnTime(value: number) {
  return Math.max(60, Math.round(value / 15) * 15);
}

function formatTurnTime(value: number) {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

function parseTurnTime(value: string) {
  const match = value.trim().match(/^(\d+):([0-5]\d)$/);
  if (!match) return 0;
  const duration = Number(match[1]) * 60 + Number(match[2]);
  return duration >= 60 && duration % 15 === 0 ? duration : 0;
}

function displayTime(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
}

function displayDateSummary(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function todayLocal() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function readError(payload: unknown) {
  if (!payload || typeof payload !== "object") return "Something went wrong.";
  const first = Object.values(payload as Record<string, unknown>)[0];
  if (Array.isArray(first)) return String(first[0]);
  return typeof first === "string" ? first : "Something went wrong.";
}

function looksLikePhoneSearch(value: string) {
  const trimmed = value.trim();
  return /^[\d\s()+.-]+$/.test(trimmed) && trimmed.replace(/\D/g, "").length >= 7;
}

export function BookingWizard({
  initialDate,
  initialShiftSlug,
  initialDuration,
  shifts,
  onClose,
  onBooked,
  presentation = "modal",
}: BookingWizardProps) {
  const minimumBookingDate = todayLocal();
  const initialTurnTime = normalizeTurnTime(initialDuration);
  const [step, setStep] = useState(1);
  const [furthestStep, setFurthestStep] = useState(1);
  const [serviceDate, setServiceDate] = useState(
    initialDate < minimumBookingDate ? minimumBookingDate : initialDate,
  );
  const [selectedShiftSlug, setSelectedShiftSlug] = useState(
    initialShiftSlug || shifts[0]?.slug || "",
  );
  const [partySize, setPartySize] = useState(2);
  const [partySizeInput, setPartySizeInput] = useState("9");
  const [durationMinutes, setDurationMinutes] = useState(initialTurnTime);
  const [turnTimeInput, setTurnTimeInput] = useState(formatTurnTime(initialTurnTime));
  const [options, setOptions] = useState<AvailabilityOption[]>([]);
  const [selectedOption, setSelectedOption] = useState<AvailabilityOption | null>(null);
  const [selectedTableIds, setSelectedTableIds] = useState<number[]>([]);
  const [assignmentDraftTableIds, setAssignmentDraftTableIds] = useState<number[]>([]);
  const [assignmentGrid, setAssignmentGrid] = useState<AssignmentGridResponse | null>(null);
  const [tablePickerOpen, setTablePickerOpen] = useState(false);
  const [assignmentLoading, setAssignmentLoading] = useState(false);
  const [reservationTags, setReservationTags] = useState<string[]>([]);
  const [customReservationTag, setCustomReservationTag] = useState("");
  const [guestTags, setGuestTags] = useState<string[]>([]);
  const [customGuestTag, setCustomGuestTag] = useState("");
  const [selectedGuest, setSelectedGuest] = useState<GuestRecord | null>(null);
  const [guestQuery, setGuestQuery] = useState("");
  const [guestResults, setGuestResults] = useState<GuestRecord[]>([]);
  const [guestSearchLoading, setGuestSearchLoading] = useState(false);
  const [guestSearchError, setGuestSearchError] = useState("");
  const [creatingGuest, setCreatingGuest] = useState(false);
  const [newGuest, setNewGuest] = useState<NewGuest>({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    company: "",
  });
  const [newGuestFocus, setNewGuestFocus] = useState<NewGuestFocus>("firstName");
  const [guestDetails, setGuestDetails] = useState<BookingDetails>({
    reservationNotes: "",
    guestNotes: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  useEffect(() => {
    if (step !== 4) return;
    const query = guestQuery.trim();
    if (!query) return;

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setGuestSearchLoading(true);
      setGuestSearchError("");
      try {
        const response = await fetch(`${appPath("/api/guests")}?q=${encodeURIComponent(query)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json()) as GuestSearchResponse | Record<string, unknown>;
        if (!response.ok) throw new Error(readError(payload));
        setGuestResults((payload as GuestSearchResponse).results);
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setGuestSearchError(reason instanceof Error ? reason.message : "Unable to search guests.");
      } finally {
        if (!controller.signal.aborted) setGuestSearchLoading(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [guestQuery, step]);

  function advanceTo(nextStep: number) {
    setStep(nextStep);
    setFurthestStep((current) => Math.max(current, nextStep));
  }

  function stageIsFilled(stage: number) {
    if (stage === 1) return Boolean(serviceDate);
    if (stage === 2) return partySize > 0 && durationMinutes > 0;
    if (stage === 3) return Boolean(selectedOption);
    if (stage === 4) return Boolean(selectedOption && selectedGuest);
    return Boolean(selectedOption && selectedGuest);
  }

  function stageValue(stage: number) {
    if (stage === 1) return serviceDate ? displayDateSummary(serviceDate) : "";
    if (stage === 2) return partySize > 0 ? `${partySize} ${partySize === 1 ? "guest" : "guests"}` : "";
    if (stage === 3) {
      if (!selectedOption) return "";
      const tableCount = selectedTableIds.length;
      return `${displayTime(selectedOption.start_time)}${tableCount ? ` · ${tableCount} table${tableCount === 1 ? "" : "s"}` : ""}`;
    }
    if (stage === 4) return selectedGuest?.full_name || "";
    if (!selectedGuest) return "";
    return "Ready";
  }

  function invalidateTimeSelection() {
    setOptions([]);
    setSelectedOption(null);
    setSelectedTableIds([]);
    setAssignmentDraftTableIds([]);
    setAssignmentGrid(null);
    setTablePickerOpen(false);
  }

  function chooseTime(option: AvailabilityOption) {
    setSelectedOption(option);
    setSelectedTableIds([]);
    setAssignmentDraftTableIds([]);
  }

  async function loadAssignmentContext(shiftSlug: string, preserveSelection = false) {
    const shift = shifts.find((item) => item.slug === shiftSlug);
    if (!shift) return;
    setAssignmentLoading(true);
    setError("");
    const availabilityQuery = new URLSearchParams({
      service_date: serviceDate,
      desired_time: shift.start_time,
      party_size: String(partySize),
      duration_minutes: String(durationMinutes),
    });
    const gridQuery = new URLSearchParams({
      date: serviceDate,
      shift: shift.slug,
    });
    try {
      const [availabilityResponse, gridResponse] = await Promise.all([
        fetch(`${appPath("/api/grid/availability")}?${availabilityQuery}`, { cache: "no-store" }),
        fetch(`${appPath("/api/grid")}?${gridQuery}`, { cache: "no-store" }),
      ]);
      const availabilityPayload = (await availabilityResponse.json()) as AvailabilityResponse | Record<string, unknown>;
      const gridPayload = (await gridResponse.json()) as AssignmentGridResponse | Record<string, unknown>;
      if (!availabilityResponse.ok) throw new Error(readError(availabilityPayload));
      if (!gridResponse.ok) throw new Error(readError(gridPayload));

      const shiftOptions = (availabilityPayload as AvailabilityResponse).options.filter(
        (option) => option.shift_slug === shift.slug,
      );
      const preservedOption = preserveSelection && selectedOption?.shift_slug === shift.slug
        ? shiftOptions.find((option) => option.start_time === selectedOption.start_time)
        : null;
      const nextOption = preservedOption || shiftOptions.find((option) => option.available) || shiftOptions[0];
      if (!nextOption) throw new Error("No reservation times are configured for this shift.");

      setSelectedShiftSlug(shift.slug);
      setOptions(shiftOptions);
      setSelectedOption(nextOption);
      setAssignmentGrid(gridPayload as AssignmentGridResponse);
      const keepTables = Boolean(preservedOption);
      if (!keepTables) setSelectedTableIds([]);
      setAssignmentDraftTableIds(keepTables ? selectedTableIds : []);
      setTablePickerOpen(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load the floor plan.");
    } finally {
      setAssignmentLoading(false);
    }
  }

  function toggleAssignmentTable(tableId: number) {
    setAssignmentDraftTableIds((current) => current.includes(tableId)
      ? current.filter((id) => id !== tableId)
      : [...current, tableId]);
  }

  function confirmTableAssignment() {
    const selectedCapacity = assignmentGrid?.tables
      .filter((table) => assignmentDraftTableIds.includes(table.id))
      .reduce((total, table) => total + table.capacity, 0) || 0;
    if (assignmentDraftTableIds.length && selectedCapacity < partySize) return;
    setSelectedTableIds(assignmentDraftTableIds);
    setTablePickerOpen(false);
    advanceTo(selectedGuest ? 5 : 4);
  }

  async function continueWithoutTableAssignment() {
    if (!stageIsFilled(2) || assignmentLoading) return;
    const shift = shifts.find((item) => item.slug === selectedShiftSlug);
    if (!shift) return;

    setAssignmentLoading(true);
    setError("");
    const availabilityQuery = new URLSearchParams({
      service_date: serviceDate,
      desired_time: shift.start_time,
      party_size: String(partySize),
      duration_minutes: String(durationMinutes),
    });
    try {
      const response = await fetch(`${appPath("/api/grid/availability")}?${availabilityQuery}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as AvailabilityResponse | Record<string, unknown>;
      if (!response.ok) throw new Error(readError(payload));
      const shiftOptions = (payload as AvailabilityResponse).options.filter(
        (option) => option.shift_slug === shift.slug,
      );
      const nextOption = shiftOptions.find((option) => option.available) || shiftOptions[0];
      if (!nextOption) throw new Error("No reservation times are configured for this shift.");

      setOptions(shiftOptions);
      setSelectedOption(nextOption);
      setSelectedTableIds([]);
      setAssignmentDraftTableIds([]);
      setTablePickerOpen(false);
      advanceTo(4);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load reservation times.");
    } finally {
      setAssignmentLoading(false);
    }
  }

  function updatePartySize(nextSize: number) {
    const normalizedSize = Math.min(40, Math.max(1, Math.round(nextSize)));
    if (normalizedSize === partySize) return;
    setPartySize(normalizedSize);
    invalidateTimeSelection();
  }

  function updateManualPartySize(value: string) {
    setPartySizeInput(value);
    const nextSize = Number(value);
    if (!Number.isInteger(nextSize) || nextSize < 9 || nextSize > 40) {
      if (partySize !== 0) invalidateTimeSelection();
      setPartySize(0);
      return;
    }
    if (nextSize === partySize) return;
    setPartySize(nextSize);
    invalidateTimeSelection();
  }

  function adjustManualPartySize(amount: number) {
    const currentSize = Number(partySizeInput);
    const startingSize = Number.isInteger(currentSize) ? currentSize : 9;
    updateManualPartySize(String(Math.min(40, Math.max(9, startingSize + amount))));
  }

  function updateTurnTime(value: string) {
    setTurnTimeInput(value);
    const nextDuration = parseTurnTime(value);
    if (!nextDuration) {
      setDurationMinutes(0);
      invalidateTimeSelection();
      return;
    }
    setDurationMinutes(nextDuration);
    invalidateTimeSelection();
  }

  function adjustTurnTime(amount: number) {
    const startingDuration = durationMinutes >= 60 ? durationMinutes : 60;
    updateTurnTime(formatTurnTime(Math.max(60, startingDuration + amount)));
  }

  function toggleReservationTag(value: string) {
    setReservationTags((current) =>
      current.includes(value) ? current.filter((tag) => tag !== value) : [...current, value],
    );
  }

  function toggleGuestTag(value: string) {
    setGuestTags((current) =>
      current.includes(value) ? current.filter((tag) => tag !== value) : [...current, value],
    );
  }

  function addCustomReservationTag() {
    const value = customReservationTag.trim();
    if (value && !reservationTags.includes(value)) setReservationTags((current) => [...current, value]);
    setCustomReservationTag("");
  }

  function addCustomGuestTag() {
    const value = customGuestTag.trim();
    if (value && !guestTags.includes(value)) setGuestTags((current) => [...current, value]);
    setCustomGuestTag("");
  }

  function chooseGuest(guest: GuestRecord) {
    setSelectedGuest(guest);
    setGuestDetails((current) => ({
      ...current,
      guestNotes: guest.guest_notes || "",
    }));
    setGuestTags(guest.tags || []);
    setCreatingGuest(false);
    setGuestSearchError("");
    advanceTo(5);
  }

  function updateGuestQuery(value: string) {
    setGuestQuery(value);
    if (value.trim()) return;
    setGuestResults([]);
    setGuestSearchLoading(false);
    setGuestSearchError("");
  }

  function startCreatingGuest() {
    const query = guestQuery.trim();

    if (looksLikePhoneSearch(query)) {
      setNewGuest({
        firstName: "",
        lastName: "",
        phone: query,
        email: "",
        company: "",
      });
      setNewGuestFocus("firstName");
      setCreatingGuest(true);
      setGuestSearchError("");
      return;
    }

    const [firstName = "", ...lastNameParts] = query.split(/\s+/);
    const lastName = lastNameParts.join(" ");
    setNewGuest({
      firstName: capitalizeNameInitial(firstName),
      lastName: capitalizeNameInitial(lastName),
      phone: "",
      email: "",
      company: "",
    });
    setNewGuestFocus(lastName ? "phone" : "lastName");
    setCreatingGuest(true);
    setGuestSearchError("");
  }

  function swapGuestNames() {
    setNewGuest((current) => ({
      ...current,
      firstName: current.lastName,
      lastName: current.firstName,
    }));
  }

  async function createGuest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGuestSearchLoading(true);
    setGuestSearchError("");
    try {
      const response = await fetch(appPath("/api/guests"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          first_name: capitalizeNameInitial(newGuest.firstName.trim()),
          last_name: capitalizeNameInitial(newGuest.lastName.trim()),
          phone_number: newGuest.phone,
          email: newGuest.email,
          company: newGuest.company,
        }),
      });
      const payload = (await response.json()) as GuestRecord | Record<string, unknown>;
      if (!response.ok) throw new Error(readError(payload));
      chooseGuest(payload as GuestRecord);
    } catch (reason) {
      setGuestSearchError(reason instanceof Error ? reason.message : "Unable to create the guest.");
    } finally {
      setGuestSearchLoading(false);
    }
  }

  async function bookReservation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedOption || !selectedGuest) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(appPath("/api/grid"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          service_date: serviceDate,
          shift_slug: selectedOption.shift_slug,
          ...(selectedTableIds.length ? {
            table_id: selectedTableIds[0],
            table_ids: selectedTableIds,
            assignment_type: "hard",
          } : {
            assignment_type: "soft",
          }),
          guest_id: selectedGuest.id,
          guest_notes: guestDetails.guestNotes,
          guest_tags: guestTags,
          notes: guestDetails.reservationNotes,
          tags: reservationTags,
          party_size: partySize,
          start_time: selectedOption.start_time,
          duration_minutes: durationMinutes,
        }),
      });
      const payload = (await response.json()) as Record<string, unknown>;
      if (!response.ok) throw new Error(readError(payload));
      onBooked(serviceDate, selectedOption.shift_slug);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to book the reservation.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={presentation === "page" ? "booking-page-shell" : "wizard-backdrop"} role="presentation" onMouseDown={(event) => {
      if (presentation === "modal" && event.target === event.currentTarget) onClose();
    }}>
      <section
        className={`booking-wizard${step === 1 ? " date-step" : ""}`}
        role={presentation === "modal" ? "dialog" : "region"}
        aria-modal={presentation === "modal" ? true : undefined}
        aria-labelledby="booking-wizard-title"
      >
        <header className="wizard-header">
          <div>
            <p>New reservation</p>
            <h2 id="booking-wizard-title">Find the right table</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close booking wizard"><X aria-hidden="true" /></button>
        </header>

        <ol className="wizard-progress" aria-label="Booking progress">
          {["Date", "Party", "Time & tables", "Guest", "Details"].map((label, index) => {
            const stage = index + 1;
            const filled = stageIsFilled(stage);
            const visited = stage <= furthestStep;
            const navigable = stage !== step && visited && filled;
            const selectedValue = stageValue(stage);
            return (
              <li key={label} className={step === stage ? "active" : visited && filled ? "complete" : ""}>
                <button
                  type="button"
                  className="wizard-progress-button"
                  onClick={() => {
                    if (!navigable) return;
                    setError("");
                    if (stage === 3) {
                      setStep(2);
                      void loadAssignmentContext(selectedShiftSlug, true);
                      return;
                    }
                    setStep(stage);
                  }}
                  disabled={!navigable}
                  aria-current={step === stage ? "step" : undefined}
                  aria-label={`${label}${selectedValue ? `: ${selectedValue}` : ""}${visited && filled ? ", completed" : ""}`}
                >
                  <span className="wizard-progress-number">{visited && filled && step !== stage ? <Check aria-hidden="true" /> : stage}</span>
                  <span className="wizard-progress-copy">
                    <span className="wizard-progress-label">{label}</span>
                    <span className="wizard-progress-value">{selectedValue}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        <div className="wizard-body">
          {step === 1 && (
            <div className="wizard-step">
              <div className="wizard-date-field">
                <ServiceDatePicker
                  value={serviceDate}
                  onChange={(value) => {
                    setServiceDate(value);
                    invalidateTimeSelection();
                    advanceTo(2);
                  }}
                  fieldLabel="Reservation Date"
                  inline
                  minDate={minimumBookingDate}
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="wizard-step">
              <div className="wizard-step-heading"><Users aria-hidden="true" /><div><h3>How large is the party?</h3><p>We’ll match them with the smallest comfortable table.</p></div></div>
              <fieldset className="party-size-picker">
                <legend>Quick select</legend>
                <div className="party-size-options">
                  {PARTY_SIZE_PRESETS.map((size) => (
                    <button
                      type="button"
                      key={size}
                      className={partySize === size ? "selected" : ""}
                      aria-pressed={partySize === size}
                      onClick={() => updatePartySize(size)}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </fieldset>
              <div className="party-size-manual">
                <span id="manual-party-size-label">Enter party size</span>
                <div className={`party-size-manual-control${partySize >= 9 ? " selected" : ""}`}>
                  <button
                    type="button"
                    aria-label="Decrease party size"
                    onClick={() => adjustManualPartySize(-1)}
                    disabled={Number(partySizeInput) <= 9}
                  >
                    <Minus aria-hidden="true" />
                  </button>
                  <input
                    {...IGNORE_AUTOFILL}
                    type="number"
                    min={9}
                    max={40}
                    inputMode="numeric"
                    value={partySizeInput}
                    aria-labelledby="manual-party-size-label"
                    aria-invalid={partySize >= 9 && !stageIsFilled(2)}
                    onFocus={() => updateManualPartySize(partySizeInput)}
                    onChange={(event) => updateManualPartySize(event.currentTarget.value)}
                  />
                  <button
                    type="button"
                    aria-label="Increase party size"
                    onClick={() => adjustManualPartySize(1)}
                    disabled={Number(partySizeInput) >= 40}
                  >
                    <Plus aria-hidden="true" />
                  </button>
                </div>
                <span className="party-size-manual-hint">9–40 guests</span>
              </div>
              <div className="turn-time-field">
                <span id="expected-turn-time-label">Expected turn</span>
                <div className={`turn-time-control${durationMinutes >= 60 ? " selected" : ""}`}>
                  <button
                    type="button"
                    aria-label="Decrease expected turn time by 15 minutes"
                    onClick={() => adjustTurnTime(-15)}
                    disabled={durationMinutes <= 60}
                  >
                    <Minus aria-hidden="true" />
                  </button>
                  <input
                    {...IGNORE_AUTOFILL}
                    type="text"
                    inputMode="text"
                    pattern="\d+:[0-5]\d"
                    placeholder="1:00"
                    value={turnTimeInput}
                    aria-labelledby="expected-turn-time-label"
                    aria-describedby="expected-turn-time-hint"
                    aria-invalid={durationMinutes === 0}
                    onChange={(event) => updateTurnTime(event.currentTarget.value)}
                    onBlur={() => {
                      if (durationMinutes >= 60) setTurnTimeInput(formatTurnTime(durationMinutes));
                    }}
                  />
                  <button
                    type="button"
                    aria-label="Increase expected turn time by 15 minutes"
                    onClick={() => adjustTurnTime(15)}
                  >
                    <Plus aria-hidden="true" />
                  </button>
                </div>
                <span id="expected-turn-time-hint" className="turn-time-hint">1:00 or longer, in 0:15 increments</span>
              </div>
              <button
                type="button"
                className="party-assign-tables-action"
                onClick={() => {
                  if (!assignmentLoading) void loadAssignmentContext(selectedShiftSlug, true);
                }}
              >
                {assignmentLoading ? <LoaderCircle className="spin" aria-hidden="true" /> : <LayoutGrid aria-hidden="true" />}
                {assignmentLoading ? "Loading floor…" : "Assign Tables"}
              </button>
            </div>
          )}

          {step === 4 && selectedOption && (
            <div className="wizard-step guest-selection-step">
              <div className="wizard-step-heading"><Users aria-hidden="true" /><div><h3>Find the guest</h3><p>Search by name, phone number, company, or email.</p></div></div>

              {!creatingGuest ? (
                <>
                  <label className="guest-search-field">
                    Guest search
                    <span>
                      <Search aria-hidden="true" />
                      <input
                        {...IGNORE_AUTOFILL}
                        autoFocus
                        type="search"
                        value={guestQuery}
                        onChange={(event) => updateGuestQuery(event.currentTarget.value)}
                        placeholder="Start typing to search the guest database"
                      />
                      {guestSearchLoading && <LoaderCircle className="spin" aria-hidden="true" />}
                    </span>
                  </label>

                  {selectedGuest && (
                    <button type="button" className="selected-guest-card" onClick={() => advanceTo(5)}>
                      <Check aria-hidden="true" />
                      <span><strong>{selectedGuest.full_name}</strong><small>Selected guest · Continue to details</small></span>
                      <ArrowRight aria-hidden="true" />
                    </button>
                  )}

                  {guestQuery.trim() && !guestSearchLoading && guestResults.length > 0 && (
                    <div className="guest-search-results" aria-label="Guest search results">
                      {guestResults.map((guest) => (
                        <button type="button" key={guest.id} onClick={() => chooseGuest(guest)}>
                          <span className="guest-result-avatar" aria-hidden="true">{guest.first_name.slice(0, 1)}{guest.last_name.slice(0, 1)}</span>
                          <span className="guest-result-copy">
                            <strong>{guest.full_name}</strong>
                            <small>
                              {guest.company && <span><Building2 aria-hidden="true" />{guest.company}</span>}
                              {guest.phone_number && <span><Phone aria-hidden="true" />{guest.phone_number}</span>}
                              {guest.email && <span><Mail aria-hidden="true" />{guest.email}</span>}
                            </small>
                          </span>
                          <ArrowRight aria-hidden="true" />
                        </button>
                      ))}
                    </div>
                  )}

                  {guestQuery.trim() && !guestSearchLoading && !guestSearchError && guestResults.length === 0 && (
                    <div className="guest-empty-state">
                      <UserPlus aria-hidden="true" />
                      <div><h4>No matching guest found</h4><p>Create a guest record and continue with this reservation.</p></div>
                      <button type="button" onClick={startCreatingGuest}>Create guest</button>
                    </div>
                  )}

                  {!guestQuery.trim() && !selectedGuest && (
                    <div className="guest-search-prompt"><Search aria-hidden="true" /><p>Enter any part of a name, phone number, company, or email address.</p></div>
                  )}
                </>
              ) : (
                <form {...IGNORE_AUTOFILL} className="new-guest-form" onSubmit={createGuest}>
                  <div className="new-guest-heading"><div><h4>Create guest record</h4><p>Add their core contact information. Notes and tags come next.</p></div><button type="button" onClick={() => setCreatingGuest(false)}>Cancel</button></div>
                  <div className="wizard-fields two-column">
                    <div className="guest-name-fields full-width">
                      <label>First name<input {...IGNORE_AUTOFILL} required autoFocus={newGuestFocus === "firstName"} value={newGuest.firstName} onInput={(event) => { const value = event.currentTarget.value; setNewGuest((current) => ({ ...current, firstName: value })); }} onBlur={() => setNewGuest((current) => ({ ...current, firstName: capitalizeNameInitial(current.firstName) }))} /></label>
                      <button type="button" className="guest-name-swap" aria-label="Swap first and last names" title="Swap first and last names" onClick={swapGuestNames}>
                        <ArrowRightLeft aria-hidden="true" />
                      </button>
                      <label>Last name<input {...IGNORE_AUTOFILL} autoFocus={newGuestFocus === "lastName"} value={newGuest.lastName} onInput={(event) => { const value = event.currentTarget.value; setNewGuest((current) => ({ ...current, lastName: value })); }} onBlur={() => setNewGuest((current) => ({ ...current, lastName: capitalizeNameInitial(current.lastName) }))} /></label>
                    </div>
                    <label>Phone number<PhoneInput autoFocus={newGuestFocus === "phone"} normalizeInitialValue value={newGuest.phone} onChange={(value) => setNewGuest((current) => ({ ...current, phone: value }))} /></label>
                    <label>Email<input {...IGNORE_AUTOFILL} type="text" inputMode="email" value={newGuest.email} onInput={(event) => { const value = event.currentTarget.value; setNewGuest((current) => ({ ...current, email: value })); }} /></label>
                    <label className="full-width">Company<input {...IGNORE_AUTOFILL} value={newGuest.company} onInput={(event) => { const value = event.currentTarget.value; setNewGuest((current) => ({ ...current, company: value })); }} /></label>
                  </div>
                  <button type="submit" className="create-guest-action" disabled={guestSearchLoading || !newGuest.firstName.trim()}>{guestSearchLoading ? <LoaderCircle className="spin" aria-hidden="true" /> : <UserPlus aria-hidden="true" />} Create and continue</button>
                </form>
              )}

              {guestSearchError && <div className="wizard-error" role="alert">{guestSearchError}</div>}
            </div>
          )}

          {step === 5 && selectedOption && selectedGuest && (
            <form {...IGNORE_AUTOFILL} id="booking-details-form" className="wizard-step" onSubmit={bookReservation}>
              <div className="wizard-step-heading"><Check aria-hidden="true" /><div><h3>Reservation details</h3><p>{displayTime(selectedOption.start_time)} · {partySize} guests · {selectedTableIds.length ? `Table${selectedTableIds.length === 1 ? "" : "s"} ${assignmentGrid?.tables.filter((table) => selectedTableIds.includes(table.id)).map((table) => table.name).join(" + ")}` : "No tables assigned"}</p></div></div>
              <div className="details-guest-summary">
                <span className="guest-result-avatar" aria-hidden="true">{selectedGuest.first_name.slice(0, 1)}{selectedGuest.last_name.slice(0, 1)}</span>
                <div><strong>{selectedGuest.full_name}</strong><small>{[selectedGuest.company, selectedGuest.phone_number, selectedGuest.email].filter(Boolean).join(" · ")}</small></div>
                <button type="button" onClick={() => setStep(4)}>Change guest</button>
              </div>
              <div className="booking-detail-sections">
                <section className="booking-detail-section reservation-detail-section" aria-labelledby="reservation-detail-heading">
                  <div className="booking-detail-section-heading"><Tag aria-hidden="true" /><div><h4 id="reservation-detail-heading">This reservation</h4><p>Saved only for this visit.</p></div></div>
                  <div className="wizard-fields">
                    <label>Reservation notes<textarea {...IGNORE_AUTOFILL} name="notes" rows={2} placeholder="Occasion, seating request, accessibility…" value={guestDetails.reservationNotes} onChange={(event) => setGuestDetails((current) => ({ ...current, reservationNotes: event.target.value }))} /></label>
                  </div>
                  <fieldset className="tag-picker">
                    <legend>Reservation tags</legend>
                    <div className="tag-options">
                      {RESERVATION_TAGS.map((tag) => <button type="button" key={tag} className={reservationTags.includes(tag) ? "selected" : ""} onClick={() => toggleReservationTag(tag)}>{reservationTags.includes(tag) && <Check aria-hidden="true" />}{tag}</button>)}
                    </div>
                    <div className="custom-tag"><input {...IGNORE_AUTOFILL} value={customReservationTag} onChange={(event) => setCustomReservationTag(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addCustomReservationTag(); } }} placeholder="Add a reservation tag" /><button type="button" onClick={addCustomReservationTag} disabled={!customReservationTag.trim()}>Add</button></div>
                  </fieldset>
                </section>
                <section className="booking-detail-section guest-detail-section" aria-labelledby="guest-detail-heading">
                  <div className="booking-detail-section-heading"><Users aria-hidden="true" /><div><h4 id="guest-detail-heading">Guest profile</h4><p>Persists for this guest on future visits.</p></div></div>
                  <div className="wizard-fields">
                    <label>Guest notes<textarea {...IGNORE_AUTOFILL} name="guest_notes" rows={2} placeholder="Preferences to remember for future visits…" value={guestDetails.guestNotes} onChange={(event) => setGuestDetails((current) => ({ ...current, guestNotes: event.target.value }))} /></label>
                  </div>
                  <fieldset className="tag-picker">
                    <legend>Guest tags</legend>
                    <div className="tag-options">
                      {GUEST_TAGS.map((tag) => <button type="button" key={tag} className={guestTags.includes(tag) ? "selected" : ""} onClick={() => toggleGuestTag(tag)}>{guestTags.includes(tag) && <Check aria-hidden="true" />}{tag}</button>)}
                    </div>
                    <div className="custom-tag"><input {...IGNORE_AUTOFILL} value={customGuestTag} onChange={(event) => setCustomGuestTag(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addCustomGuestTag(); } }} placeholder="Add a guest tag" /><button type="button" onClick={addCustomGuestTag} disabled={!customGuestTag.trim()}>Add</button></div>
                  </fieldset>
                </section>
              </div>
            </form>
          )}

          {error && <div className="wizard-error" role="alert">{error}</div>}
        </div>

        <footer className="wizard-footer">
          {step > 1 ? <button type="button" className="wizard-back" onClick={() => { setError(""); setStep((value) => value === 4 ? 2 : value - 1); }} disabled={loading}><ArrowLeft aria-hidden="true" /> Back</button> : <span />}
          {step === 1 && <button type="button" className="wizard-next" onClick={() => advanceTo(2)} disabled={!serviceDate}>Party size <ArrowRight aria-hidden="true" /></button>}
          {step === 2 && <button type="button" className="wizard-next" onClick={() => void continueWithoutTableAssignment()} disabled={assignmentLoading || !stageIsFilled(2)}>{assignmentLoading ? <LoaderCircle className="spin" aria-hidden="true" /> : null} Guest <ArrowRight aria-hidden="true" /></button>}
          {step === 4 && selectedGuest && <button type="button" className="wizard-next" onClick={() => advanceTo(5)}>Details <ArrowRight aria-hidden="true" /></button>}
          {step === 5 && <button type="submit" form="booking-details-form" className="wizard-next" disabled={loading || !selectedGuest}>{loading ? <LoaderCircle className="spin" aria-hidden="true" /> : <Check aria-hidden="true" />} Book reservation</button>}
        </footer>
      </section>
      {tablePickerOpen && assignmentGrid && selectedOption && (
        <ReservationTablePicker
          tables={assignmentGrid.tables}
          reservations={assignmentGrid.reservations}
          selectedTableIds={assignmentDraftTableIds}
          partySize={partySize}
          startTime={selectedOption.start_time}
          durationMinutes={durationMinutes}
          shifts={shifts}
          selectedShiftSlug={selectedShiftSlug}
          timeOptions={options}
          loading={assignmentLoading}
          onShiftChange={(shiftSlug) => void loadAssignmentContext(shiftSlug)}
          onTimeChange={(startTime) => {
            const option = options.find((item) => item.start_time === startTime);
            if (option) chooseTime(option);
          }}
          onToggleTable={toggleAssignmentTable}
          onClose={() => setTablePickerOpen(false)}
          onConfirm={confirmTableAssignment}
        />
      )}
    </div>
  );
}
