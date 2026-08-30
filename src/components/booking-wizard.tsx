"use client";

import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarDays,
  Check,
  Clock3,
  LoaderCircle,
  Mail,
  Phone,
  Search,
  Tag,
  Users,
  UserPlus,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { PhoneInput } from "@/components/phone-input";
import { ServiceDatePicker } from "@/components/service-date-picker";
import { appPath } from "@/lib/app-paths";
import { IGNORE_AUTOFILL } from "@/lib/autofill";
import { capitalizeNameInitial } from "@/lib/guest-names";

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

type BookingWizardProps = {
  initialDate: string;
  initialShiftSlug: string;
  initialDuration: number;
  shifts: ShiftChoice[];
  onClose: () => void;
  onBooked: (serviceDate: string, shiftSlug: string) => void;
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

const PRESET_TAGS = ["VIP", "Birthday", "Anniversary", "First visit", "Business", "Accessibility"];
const PARTY_SIZE_PRESETS = [1, 2, 3, 4, 5, 6, 7, 8];

function displayTime(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
}

function displayHour(time: string) {
  const hour = Number(time.split(":")[0]);
  return `${hour % 12 || 12} ${hour >= 12 ? "PM" : "AM"}`;
}

function groupTimesByHour(options: AvailabilityOption[]) {
  const groups = new Map<string, AvailabilityOption[]>();
  [...options]
    .sort((left, right) => left.start_time.localeCompare(right.start_time))
    .forEach((option) => {
      const hour = option.start_time.slice(0, 2);
      groups.set(hour, [...(groups.get(hour) || []), option]);
    });
  return [...groups.entries()].map(([hour, hourOptions]) => ({
    hour,
    label: displayHour(`${hour}:00`),
    options: hourOptions,
  }));
}

function displayDateSummary(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(`${value}T12:00:00`));
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
}: BookingWizardProps) {
  const [step, setStep] = useState(1);
  const [furthestStep, setFurthestStep] = useState(1);
  const [serviceDate, setServiceDate] = useState(initialDate);
  const [selectedShiftSlug, setSelectedShiftSlug] = useState(
    initialShiftSlug || shifts[0]?.slug || "",
  );
  const [partySize, setPartySize] = useState(2);
  const [partySizeInput, setPartySizeInput] = useState("2");
  const [durationMinutes, setDurationMinutes] = useState(initialDuration);
  const [options, setOptions] = useState<AvailabilityOption[]>([]);
  const [selectedOption, setSelectedOption] = useState<AvailabilityOption | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState("");
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
    if (stage === 3) return selectedOption ? displayTime(selectedOption.start_time) : "";
    if (stage === 4) return selectedGuest?.full_name || "";
    if (!selectedGuest) return "";
    return selectedTags.length ? `${selectedTags.length} ${selectedTags.length === 1 ? "tag" : "tags"}` : "Ready";
  }

  function invalidateTimeSelection() {
    setOptions([]);
    setSelectedOption(null);
  }

  function updatePartySize(nextSize: number) {
    const normalizedSize = Math.min(40, Math.max(1, Math.round(nextSize)));
    setPartySizeInput(String(normalizedSize));
    if (normalizedSize === partySize) return;
    setPartySize(normalizedSize);
    invalidateTimeSelection();
  }

  function updateManualPartySize(value: string) {
    setPartySizeInput(value);
    const nextSize = Number(value);
    if (!Number.isInteger(nextSize) || nextSize < 1 || nextSize > 40) {
      if (partySize !== 0) invalidateTimeSelection();
      setPartySize(0);
      return;
    }
    if (nextSize === partySize) return;
    setPartySize(nextSize);
    invalidateTimeSelection();
  }

  async function findTimes(shiftSlug = selectedShiftSlug, requestedPartySize = partySize) {
    const shift = shifts.find((item) => item.slug === shiftSlug);
    if (!shift) return;
    setLoading(true);
    setError("");
    setSelectedShiftSlug(shift.slug);
    setSelectedOption(null);
    setOptions([]);
    const query = new URLSearchParams({
      service_date: serviceDate,
      desired_time: shift.start_time,
      party_size: String(requestedPartySize),
      duration_minutes: String(durationMinutes),
    });
    try {
      const response = await fetch(`${appPath("/api/grid/availability")}?${query}`, { cache: "no-store" });
      const payload = (await response.json()) as AvailabilityResponse | Record<string, unknown>;
      if (!response.ok) throw new Error(readError(payload));
      setOptions(
        (payload as AvailabilityResponse).options.filter(
          (option) => option.shift_slug === shift.slug,
        ),
      );
      advanceTo(3);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to search available times.");
    } finally {
      setLoading(false);
    }
  }

  function toggleTag(value: string) {
    setSelectedTags((current) =>
      current.includes(value) ? current.filter((tag) => tag !== value) : [...current, value],
    );
  }

  function addCustomTag() {
    const value = customTag.trim();
    if (value && !selectedTags.includes(value)) setSelectedTags((current) => [...current, value]);
    setCustomTag("");
  }

  function chooseGuest(guest: GuestRecord) {
    setSelectedGuest(guest);
    setGuestDetails((current) => ({
      ...current,
      guestNotes: guest.guest_notes || "",
    }));
    setSelectedTags(guest.tags || []);
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
          table_id: selectedOption.table_id,
          guest_id: selectedGuest.id,
          guest_notes: guestDetails.guestNotes,
          notes: guestDetails.reservationNotes,
          tags: selectedTags,
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
    <div className="wizard-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className={`booking-wizard${step === 1 ? " date-step" : ""}`} role="dialog" aria-modal="true" aria-labelledby="booking-wizard-title">
        <header className="wizard-header">
          <div>
            <p>New reservation</p>
            <h2 id="booking-wizard-title">Find the right table</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close booking wizard"><X aria-hidden="true" /></button>
        </header>

        <ol className="wizard-progress" aria-label="Booking progress">
          {["Date", "Party", "Time", "Guest", "Details"].map((label, index) => {
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
              <div className="wizard-step-heading"><CalendarDays aria-hidden="true" /><div><h3>When are they joining us?</h3><p>Choose the reservation date from the calendar.</p></div></div>
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
                      onClick={() => {
                        updatePartySize(size);
                        void findTimes(selectedShiftSlug, size);
                      }}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </fieldset>
              <label className="party-size-manual">
                Enter party size
                <input
                  {...IGNORE_AUTOFILL}
                  type="number"
                  min={1}
                  max={40}
                  inputMode="numeric"
                  value={partySizeInput}
                  aria-invalid={!stageIsFilled(2)}
                  onChange={(event) => updateManualPartySize(event.currentTarget.value)}
                />
                <span>1–40 guests</span>
              </label>
              <label className="turn-time-field">Expected turn<select {...IGNORE_AUTOFILL} value={durationMinutes} onChange={(event) => { setDurationMinutes(Number(event.target.value)); invalidateTimeSelection(); }}>
                {[45, 60, 75, 90, 105, 120, 135, 150, 180].map((value) => <option key={value} value={value}>{value} minutes</option>)}
              </select></label>
            </div>
          )}

          {step === 3 && (
            <div className="wizard-step">
              <div className="wizard-step-heading"><Clock3 aria-hidden="true" /><div><h3>Choose an available time</h3><p>Select a shift, then choose from the available reservation times.</p></div></div>
              <div className="wizard-shift-picker" aria-label="Reservation shift">
                {shifts.map((shift) => (
                  <button
                    type="button"
                    key={shift.id}
                    className={shift.slug === selectedShiftSlug ? "selected" : ""}
                    aria-pressed={shift.slug === selectedShiftSlug}
                    onClick={() => void findTimes(shift.slug)}
                    disabled={loading}
                  >
                    <strong>{shift.name}</strong>
                    <span>{displayTime(shift.start_time)}–{displayTime(shift.end_time)}</span>
                  </button>
                ))}
              </div>
              {options.length ? (
                <div className="available-time-columns" aria-label="Reservation times grouped by hour">
                  {groupTimesByHour(options).map((group) => (
                    <section className="available-hour-group" key={group.hour} aria-labelledby={`time-hour-${group.hour}`}>
                      <h4 id={`time-hour-${group.hour}`}>{group.label}</h4>
                      <div>
                        {group.options.map((option) => (
                          <button
                            type="button"
                            key={`${option.shift_slug}-${option.start_time}`}
                            className={option.available ? "" : "is-unavailable"}
                            disabled={!option.available || option.table_id === null}
                            aria-label={`${displayTime(option.start_time)}, ${option.available ? `seats up to ${option.table_capacity}` : option.unavailable_reason}`}
                            onClick={() => {
                              if (!option.available || option.table_id === null) return;
                              setSelectedOption(option);
                              advanceTo(selectedGuest ? 5 : 4);
                            }}
                          >
                            <strong>{displayTime(option.start_time)}</strong>
                            <span>{option.available ? `Seats up to ${option.table_capacity}` : option.unavailable_reason}</span>
                          </button>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              ) : loading ? (
                <div className="availability-loading"><LoaderCircle className="spin" aria-hidden="true" /> Checking this shift…</div>
              ) : (
                <div className="no-availability"><Search aria-hidden="true" /><h4>No comfortable tables found</h4><p>Try another shift, day, party size, or a shorter turn.</p></div>
              )}
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
                    <label>First name<input {...IGNORE_AUTOFILL} required autoFocus={newGuestFocus === "firstName"} value={newGuest.firstName} onInput={(event) => { const value = event.currentTarget.value; setNewGuest((current) => ({ ...current, firstName: value })); }} onBlur={() => setNewGuest((current) => ({ ...current, firstName: capitalizeNameInitial(current.firstName) }))} /></label>
                    <label>Last name<input {...IGNORE_AUTOFILL} autoFocus={newGuestFocus === "lastName"} value={newGuest.lastName} onInput={(event) => { const value = event.currentTarget.value; setNewGuest((current) => ({ ...current, lastName: value })); }} onBlur={() => setNewGuest((current) => ({ ...current, lastName: capitalizeNameInitial(current.lastName) }))} /></label>
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
              <div className="wizard-step-heading"><Check aria-hidden="true" /><div><h3>Reservation details</h3><p>{displayTime(selectedOption.start_time)} · {partySize} guests · Table {selectedOption.table_name}</p></div></div>
              <div className="details-guest-summary">
                <span className="guest-result-avatar" aria-hidden="true">{selectedGuest.first_name.slice(0, 1)}{selectedGuest.last_name.slice(0, 1)}</span>
                <div><strong>{selectedGuest.full_name}</strong><small>{[selectedGuest.company, selectedGuest.phone_number, selectedGuest.email].filter(Boolean).join(" · ")}</small></div>
                <button type="button" onClick={() => setStep(4)}>Change guest</button>
              </div>
              <div className="wizard-fields">
                <label>Reservation notes<textarea {...IGNORE_AUTOFILL} name="notes" rows={2} placeholder="Occasion, seating request, accessibility…" value={guestDetails.reservationNotes} onChange={(event) => setGuestDetails((current) => ({ ...current, reservationNotes: event.target.value }))} /></label>
                <label>Guest notes<textarea {...IGNORE_AUTOFILL} name="guest_notes" rows={2} placeholder="Preferences to remember for future visits…" value={guestDetails.guestNotes} onChange={(event) => setGuestDetails((current) => ({ ...current, guestNotes: event.target.value }))} /></label>
              </div>
              <fieldset className="tag-picker">
                <legend><Tag aria-hidden="true" /> Guest tags</legend>
                <div className="tag-options">
                  {PRESET_TAGS.map((tag) => <button type="button" key={tag} className={selectedTags.includes(tag) ? "selected" : ""} onClick={() => toggleTag(tag)}>{selectedTags.includes(tag) && <Check aria-hidden="true" />}{tag}</button>)}
                </div>
                <div className="custom-tag"><input {...IGNORE_AUTOFILL} value={customTag} onChange={(event) => setCustomTag(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addCustomTag(); } }} placeholder="Add a custom tag" /><button type="button" onClick={addCustomTag} disabled={!customTag.trim()}>Add</button></div>
              </fieldset>
            </form>
          )}

          {error && <div className="wizard-error" role="alert">{error}</div>}
        </div>

        <footer className="wizard-footer">
          {step > 1 ? <button type="button" className="wizard-back" onClick={() => { setError(""); setStep((value) => value - 1); }} disabled={loading}><ArrowLeft aria-hidden="true" /> Back</button> : <span />}
          {step === 1 && <button type="button" className="wizard-next" onClick={() => advanceTo(2)} disabled={!serviceDate}>Party size <ArrowRight aria-hidden="true" /></button>}
          {step === 2 && <button type="button" className="wizard-next" onClick={() => void findTimes()} disabled={loading || !stageIsFilled(2)}>{loading ? <LoaderCircle className="spin" aria-hidden="true" /> : <Search aria-hidden="true" />} Find times</button>}
          {step === 3 && !options.length && !loading && <button type="button" className="wizard-next" onClick={() => setStep(1)}>Change search <ArrowRight aria-hidden="true" /></button>}
          {step === 4 && selectedGuest && <button type="button" className="wizard-next" onClick={() => advanceTo(5)}>Details <ArrowRight aria-hidden="true" /></button>}
          {step === 5 && <button type="submit" form="booking-details-form" className="wizard-next" disabled={loading || !selectedGuest}>{loading ? <LoaderCircle className="spin" aria-hidden="true" /> : <Check aria-hidden="true" />} Book reservation</button>}
        </footer>
      </section>
    </div>
  );
}
