"use client";

import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  Clock3,
  LoaderCircle,
  Minus,
  Plus,
  Search,
  Tag,
  Users,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { ServiceDatePicker } from "@/components/service-date-picker";
import { appPath } from "@/lib/app-paths";

type AvailabilityOption = {
  service_date: string;
  shift_slug: string;
  shift_name: string;
  start_time: string;
  table_id: number;
  table_name: string;
  table_capacity: number;
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

type GuestDetails = {
  guestName: string;
  phone: string;
  email: string;
  reservationNotes: string;
  guestNotes: string;
};

const PRESET_TAGS = ["VIP", "Birthday", "Anniversary", "First visit", "Business", "Accessibility"];

function displayTime(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
}

function readError(payload: unknown) {
  if (!payload || typeof payload !== "object") return "Something went wrong.";
  const first = Object.values(payload as Record<string, unknown>)[0];
  if (Array.isArray(first)) return String(first[0]);
  return typeof first === "string" ? first : "Something went wrong.";
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
  const [durationMinutes, setDurationMinutes] = useState(initialDuration);
  const [options, setOptions] = useState<AvailabilityOption[]>([]);
  const [selectedOption, setSelectedOption] = useState<AvailabilityOption | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState("");
  const [guestDetails, setGuestDetails] = useState<GuestDetails>({
    guestName: "",
    phone: "",
    email: "",
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

  function advanceTo(nextStep: number) {
    setStep(nextStep);
    setFurthestStep((current) => Math.max(current, nextStep));
  }

  function stageIsFilled(stage: number) {
    if (stage === 1) return Boolean(serviceDate);
    if (stage === 2) return partySize > 0 && durationMinutes > 0;
    if (stage === 3) return Boolean(selectedOption);
    return Boolean(selectedOption && guestDetails.guestName.trim());
  }

  function invalidateTimeSelection() {
    setOptions([]);
    setSelectedOption(null);
  }

  async function findTimes(shiftSlug = selectedShiftSlug) {
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
      party_size: String(partySize),
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

  async function bookReservation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedOption) return;
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
          guest_name: guestDetails.guestName,
          guest_phone: guestDetails.phone,
          guest_email: guestDetails.email,
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
      <section className="booking-wizard" role="dialog" aria-modal="true" aria-labelledby="booking-wizard-title">
        <header className="wizard-header">
          <div>
            <p>New reservation</p>
            <h2 id="booking-wizard-title">Find the right table</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close booking wizard"><X aria-hidden="true" /></button>
        </header>

        <ol className="wizard-progress" aria-label="Booking progress">
          {["When", "Party", "Time", "Guest"].map((label, index) => {
            const stage = index + 1;
            const filled = stageIsFilled(stage);
            const visited = stage <= furthestStep;
            const navigable = stage !== step && visited && filled;
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
                  aria-label={`${label}${visited && filled ? ", completed" : ""}`}
                >
                  <span className="wizard-progress-number">{visited && filled && step !== stage ? <Check aria-hidden="true" /> : stage}</span>
                  <span className="wizard-progress-label">{label}</span>
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
              <div className="party-picker" aria-label="Party size">
                <button type="button" onClick={() => { setPartySize((value) => Math.max(1, value - 1)); invalidateTimeSelection(); }} disabled={partySize === 1} aria-label="Decrease party size"><Minus aria-hidden="true" /></button>
                <div><strong>{partySize}</strong><span>{partySize === 1 ? "guest" : "guests"}</span></div>
                <button type="button" onClick={() => { setPartySize((value) => Math.min(40, value + 1)); invalidateTimeSelection(); }} disabled={partySize === 40} aria-label="Increase party size"><Plus aria-hidden="true" /></button>
              </div>
              <label className="turn-time-field">Expected turn<select value={durationMinutes} onChange={(event) => { setDurationMinutes(Number(event.target.value)); invalidateTimeSelection(); }}>
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
                <div className="available-time-row" aria-label="Available times">
                  {options.map((option) => (
                    <button type="button" key={`${option.shift_slug}-${option.start_time}-${option.table_id}`} onClick={() => { setSelectedOption(option); advanceTo(4); }}>
                      <strong>{displayTime(option.start_time)}</strong>
                      <span>Seats up to {option.table_capacity}</span>
                    </button>
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
            <form id="booking-guest-form" className="wizard-step" onSubmit={bookReservation}>
              <div className="wizard-step-heading"><Check aria-hidden="true" /><div><h3>Who are we welcoming?</h3><p>{displayTime(selectedOption.start_time)} · {partySize} guests · Table {selectedOption.table_name}</p></div></div>
              <div className="wizard-fields two-column">
                <label className="full-width">Guest name<input name="guest_name" required autoFocus placeholder="Full name" value={guestDetails.guestName} onChange={(event) => setGuestDetails((current) => ({ ...current, guestName: event.target.value }))} /></label>
                <label>Phone<input name="guest_phone" type="tel" placeholder="Phone number" value={guestDetails.phone} onChange={(event) => setGuestDetails((current) => ({ ...current, phone: event.target.value }))} /></label>
                <label>Email<input name="guest_email" type="email" placeholder="Email address" value={guestDetails.email} onChange={(event) => setGuestDetails((current) => ({ ...current, email: event.target.value }))} /></label>
                <label className="full-width">Reservation notes<textarea name="notes" rows={2} placeholder="Occasion, seating request, accessibility…" value={guestDetails.reservationNotes} onChange={(event) => setGuestDetails((current) => ({ ...current, reservationNotes: event.target.value }))} /></label>
                <label className="full-width">Guest notes<textarea name="guest_notes" rows={2} placeholder="Preferences to remember for future visits…" value={guestDetails.guestNotes} onChange={(event) => setGuestDetails((current) => ({ ...current, guestNotes: event.target.value }))} /></label>
              </div>
              <fieldset className="tag-picker">
                <legend><Tag aria-hidden="true" /> Guest tags</legend>
                <div className="tag-options">
                  {PRESET_TAGS.map((tag) => <button type="button" key={tag} className={selectedTags.includes(tag) ? "selected" : ""} onClick={() => toggleTag(tag)}>{selectedTags.includes(tag) && <Check aria-hidden="true" />}{tag}</button>)}
                </div>
                <div className="custom-tag"><input value={customTag} onChange={(event) => setCustomTag(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addCustomTag(); } }} placeholder="Add a custom tag" /><button type="button" onClick={addCustomTag} disabled={!customTag.trim()}>Add</button></div>
              </fieldset>
            </form>
          )}

          {error && <div className="wizard-error" role="alert">{error}</div>}
        </div>

        <footer className="wizard-footer">
          {step > 1 ? <button type="button" className="wizard-back" onClick={() => { setError(""); setStep((value) => value - 1); }} disabled={loading}><ArrowLeft aria-hidden="true" /> Back</button> : <span />}
          {step === 1 && <button type="button" className="wizard-next" onClick={() => advanceTo(2)} disabled={!serviceDate}>Party size <ArrowRight aria-hidden="true" /></button>}
          {step === 2 && <button type="button" className="wizard-next" onClick={() => void findTimes()} disabled={loading}>{loading ? <LoaderCircle className="spin" aria-hidden="true" /> : <Search aria-hidden="true" />} Find times</button>}
          {step === 3 && !options.length && !loading && <button type="button" className="wizard-next" onClick={() => setStep(1)}>Change search <ArrowRight aria-hidden="true" /></button>}
          {step === 4 && <button type="submit" form="booking-guest-form" className="wizard-next" disabled={loading || !guestDetails.guestName.trim()}>{loading ? <LoaderCircle className="spin" aria-hidden="true" /> : <Check aria-hidden="true" />} Book reservation</button>}
        </footer>
      </section>
    </div>
  );
}
