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
import { appPath } from "@/lib/app-paths";

type AvailabilityOption = {
  service_date: string;
  shift_slug: string;
  shift_name: string;
  start_time: string;
  table_id: number;
  table_name: string;
  table_capacity: number;
  is_exact: boolean;
  difference_minutes: number;
};

type AvailabilityResponse = {
  options: AvailabilityOption[];
};

type BookingWizardProps = {
  initialDate: string;
  initialTime: string;
  initialDuration: number;
  onClose: () => void;
  onBooked: (serviceDate: string, shiftSlug: string) => void;
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

function nearbyLabel(minutes: number) {
  if (minutes === 0) return "Exact time";
  const direction = minutes > 0 ? "later" : "earlier";
  const distance = Math.abs(minutes);
  return `${distance >= 60 ? `${distance / 60} hr` : `${distance} min`} ${direction}`;
}

export function BookingWizard({
  initialDate,
  initialTime,
  initialDuration,
  onClose,
  onBooked,
}: BookingWizardProps) {
  const [step, setStep] = useState(1);
  const [serviceDate, setServiceDate] = useState(initialDate);
  const [desiredTime, setDesiredTime] = useState(initialTime);
  const [partySize, setPartySize] = useState(2);
  const [durationMinutes, setDurationMinutes] = useState(initialDuration);
  const [options, setOptions] = useState<AvailabilityOption[]>([]);
  const [selectedOption, setSelectedOption] = useState<AvailabilityOption | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  async function findTimes() {
    setLoading(true);
    setError("");
    const query = new URLSearchParams({
      service_date: serviceDate,
      desired_time: desiredTime,
      party_size: String(partySize),
      duration_minutes: String(durationMinutes),
    });
    try {
      const response = await fetch(`${appPath("/api/grid/availability")}?${query}`, { cache: "no-store" });
      const payload = (await response.json()) as AvailabilityResponse | Record<string, unknown>;
      if (!response.ok) throw new Error(readError(payload));
      setOptions((payload as AvailabilityResponse).options);
      setStep(3);
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
    const values = new FormData(event.currentTarget);
    try {
      const response = await fetch(appPath("/api/grid"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          service_date: serviceDate,
          shift_slug: selectedOption.shift_slug,
          table_id: selectedOption.table_id,
          guest_name: values.get("guest_name"),
          guest_phone: values.get("guest_phone"),
          guest_email: values.get("guest_email"),
          guest_notes: values.get("guest_notes"),
          notes: values.get("notes"),
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
          {["When", "Party", "Time", "Guest"].map((label, index) => (
            <li key={label} className={step === index + 1 ? "active" : step > index + 1 ? "complete" : ""}>
              <span>{step > index + 1 ? <Check aria-hidden="true" /> : index + 1}</span>
              {label}
            </li>
          ))}
        </ol>

        <div className="wizard-body">
          {step === 1 && (
            <div className="wizard-step">
              <div className="wizard-step-heading"><CalendarDays aria-hidden="true" /><div><h3>When are they joining us?</h3><p>Start with the requested day and arrival time.</p></div></div>
              <div className="wizard-fields two-column">
                <label>Service date<input type="date" value={serviceDate} onChange={(event) => setServiceDate(event.target.value)} autoFocus /></label>
                <label>Requested time<input type="time" step="900" value={desiredTime} onChange={(event) => setDesiredTime(event.target.value)} /></label>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="wizard-step">
              <div className="wizard-step-heading"><Users aria-hidden="true" /><div><h3>How large is the party?</h3><p>We’ll match them with the smallest comfortable table.</p></div></div>
              <div className="party-picker" aria-label="Party size">
                <button type="button" onClick={() => setPartySize((value) => Math.max(1, value - 1))} disabled={partySize === 1} aria-label="Decrease party size"><Minus aria-hidden="true" /></button>
                <div><strong>{partySize}</strong><span>{partySize === 1 ? "guest" : "guests"}</span></div>
                <button type="button" onClick={() => setPartySize((value) => Math.min(40, value + 1))} disabled={partySize === 40} aria-label="Increase party size"><Plus aria-hidden="true" /></button>
              </div>
              <label className="turn-time-field">Expected turn<select value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))}>
                {[45, 60, 75, 90, 105, 120, 135, 150, 180].map((value) => <option key={value} value={value}>{value} minutes</option>)}
              </select></label>
            </div>
          )}

          {step === 3 && (
            <div className="wizard-step">
              <div className="wizard-step-heading"><Clock3 aria-hidden="true" /><div><h3>Choose an available time</h3><p>Closest matches to {displayTime(desiredTime)} on {serviceDate}.</p></div></div>
              {options.length ? (
                <div className="availability-options">
                  {options.map((option) => (
                    <button type="button" key={`${option.shift_slug}-${option.start_time}`} onClick={() => { setSelectedOption(option); setStep(4); }}>
                      <span className="availability-time">{displayTime(option.start_time)}</span>
                      <span>{option.shift_name} · Table {option.table_name}</span>
                      <small className={option.is_exact ? "exact" : ""}>{nearbyLabel(option.difference_minutes)}</small>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="no-availability"><Search aria-hidden="true" /><h4>No comfortable tables found</h4><p>Try another day, time, party size, or a shorter turn.</p></div>
              )}
            </div>
          )}

          {step === 4 && selectedOption && (
            <form id="booking-guest-form" className="wizard-step" onSubmit={bookReservation}>
              <div className="wizard-step-heading"><Check aria-hidden="true" /><div><h3>Who are we welcoming?</h3><p>{displayTime(selectedOption.start_time)} · {partySize} guests · Table {selectedOption.table_name}</p></div></div>
              <div className="wizard-fields two-column">
                <label className="full-width">Guest name<input name="guest_name" required autoFocus placeholder="Full name" /></label>
                <label>Phone<input name="guest_phone" type="tel" placeholder="Phone number" /></label>
                <label>Email<input name="guest_email" type="email" placeholder="Email address" /></label>
                <label className="full-width">Reservation notes<textarea name="notes" rows={2} placeholder="Occasion, seating request, accessibility…" /></label>
                <label className="full-width">Guest notes<textarea name="guest_notes" rows={2} placeholder="Preferences to remember for future visits…" /></label>
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
          {step === 1 && <button type="button" className="wizard-next" onClick={() => setStep(2)} disabled={!serviceDate || !desiredTime}>Party size <ArrowRight aria-hidden="true" /></button>}
          {step === 2 && <button type="button" className="wizard-next" onClick={() => void findTimes()} disabled={loading}>{loading ? <LoaderCircle className="spin" aria-hidden="true" /> : <Search aria-hidden="true" />} Find times</button>}
          {step === 3 && !options.length && <button type="button" className="wizard-next" onClick={() => setStep(1)}>Change search <ArrowRight aria-hidden="true" /></button>}
          {step === 4 && <button type="submit" form="booking-guest-form" className="wizard-next" disabled={loading}>{loading ? <LoaderCircle className="spin" aria-hidden="true" /> : <Check aria-hidden="true" />} Book reservation</button>}
        </footer>
      </section>
    </div>
  );
}
