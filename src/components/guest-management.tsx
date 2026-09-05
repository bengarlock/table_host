"use client";

import {
  Building2,
  Check,
  ContactRound,
  LoaderCircle,
  Mail,
  Phone,
  Plus,
  Search,
  Tag,
  UserRound,
} from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { PhoneInput } from "@/components/phone-input";
import { TagIcon } from "@/components/tag-icon";
import { appPath } from "@/lib/app-paths";
import { IGNORE_AUTOFILL } from "@/lib/autofill";
import { capitalizeNameInitial } from "@/lib/guest-names";
import { GUEST_TAGS } from "@/lib/reservation-tags";

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

type GuestResponse = {
  count: number;
  results: GuestRecord[];
};

type GuestDraft = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  company: string;
  notes: string;
  tags: string[];
};

const EMPTY_GUEST: GuestDraft = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  company: "",
  notes: "",
  tags: [],
};

function guestDraft(guest: GuestRecord): GuestDraft {
  return {
    firstName: guest.first_name,
    lastName: guest.last_name,
    phone: guest.phone_number,
    email: guest.email,
    company: guest.company,
    notes: guest.guest_notes || "",
    tags: guest.tags || [],
  };
}

function initials(guest: GuestRecord) {
  return `${guest.first_name[0] || ""}${guest.last_name[0] || ""}`.toUpperCase() || "G";
}

function readError(payload: unknown) {
  if (!payload || typeof payload !== "object") return "Unable to save the guest record.";
  const first = Object.values(payload as Record<string, unknown>)[0];
  if (Array.isArray(first)) return String(first[0]);
  return typeof first === "string" ? first : "Unable to save the guest record.";
}

export function GuestManagement() {
  const [query, setQuery] = useState("");
  const [guests, setGuests] = useState<GuestRecord[]>([]);
  const [guestCount, setGuestCount] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<GuestDraft | null>(null);
  const [creating, setCreating] = useState(false);
  const [customTag, setCustomTag] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({ limit: "50" });
      if (query.trim()) params.set("q", query.trim());
      try {
        const response = await fetch(`${appPath("/api/guests")}?${params}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json()) as GuestResponse | Record<string, unknown>;
        if (!response.ok) throw new Error(readError(payload));
        setGuests((payload as GuestResponse).results);
        setGuestCount((payload as GuestResponse).count);
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "Unable to load guests.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, query.trim() ? 250 : 0);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [query]);

  function selectGuest(guest: GuestRecord) {
    setSelectedId(guest.id);
    setDraft(guestDraft(guest));
    setCreating(false);
    setCustomTag("");
    setError("");
    setSaved(false);
  }

  function startGuest() {
    setSelectedId(null);
    setDraft({ ...EMPTY_GUEST, tags: [] });
    setCreating(true);
    setCustomTag("");
    setError("");
    setSaved(false);
  }

  function updateDraft(field: keyof Omit<GuestDraft, "tags">, value: string) {
    setDraft((current) => current ? { ...current, [field]: value } : current);
    setSaved(false);
  }

  function toggleTag(value: string) {
    setDraft((current) => {
      if (!current) return current;
      const tags = current.tags.includes(value)
        ? current.tags.filter((tag) => tag !== value)
        : [...current.tags, value];
      return { ...current, tags };
    });
    setSaved(false);
  }

  function addCustomTag() {
    const value = customTag.trim();
    if (!value) return;
    setDraft((current) => current && !current.tags.includes(value)
      ? { ...current, tags: [...current.tags, value] }
      : current);
    setCustomTag("");
    setSaved(false);
  }

  async function saveGuest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || !draft.firstName.trim()) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const response = await fetch(
        creating ? appPath("/api/guests") : appPath(`/api/guests/${selectedId}`),
        {
          method: creating ? "POST" : "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            first_name: capitalizeNameInitial(draft.firstName.trim()),
            last_name: capitalizeNameInitial(draft.lastName.trim()),
            phone_number: draft.phone.trim(),
            email: draft.email.trim(),
            company: draft.company.trim(),
            guest_notes: draft.notes.trim(),
            tags: draft.tags,
          }),
        },
      );
      const payload = (await response.json()) as GuestRecord | Record<string, unknown>;
      if (!response.ok) throw new Error(readError(payload));
      const savedGuest = payload as GuestRecord;
      setGuests((current) => [...current.filter((guest) => guest.id !== savedGuest.id), savedGuest]
        .sort((left, right) => left.full_name.localeCompare(right.full_name)));
      if (creating) setGuestCount((current) => current + 1);
      setSelectedId(savedGuest.id);
      setDraft(guestDraft(savedGuest));
      setCreating(false);
      setSaved(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save the guest record.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="guest-management-page" aria-labelledby="guest-management-title">
      <header className="guest-management-header">
        <h1 className="guest-management-kicker" id="guest-management-title">Guest database</h1>
        <button type="button" className="guest-add-button" onClick={startGuest}>
          <Plus aria-hidden="true" /> New guest
        </button>
      </header>

      <div className="guest-management-layout">
        <aside className="guest-directory" aria-label="Guest directory">
          <label className="guest-directory-search">
            <Search aria-hidden="true" />
            <input
              {...IGNORE_AUTOFILL}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="Name, phone, company, or email"
              aria-label="Search guests"
            />
            {loading && <LoaderCircle className="spin" aria-hidden="true" />}
          </label>
          <div className="guest-directory-count">{guestCount} {guestCount === 1 ? "guest" : "guests"}</div>
          <div className="guest-directory-list">
            {guests.map((guest) => (
              <button
                type="button"
                key={guest.id}
                className={guest.id === selectedId ? "selected" : ""}
                onClick={() => selectGuest(guest)}
              >
                <span className="guest-directory-avatar">{initials(guest)}</span>
                <span>
                  <strong>{guest.full_name}</strong>
                  <small>{guest.company || guest.email || guest.phone_number || "No contact details"}</small>
                </span>
                {guest.tags.length > 0 && <em><TagIcon tag={guest.tags[0]} />{guest.tags[0]}</em>}
              </button>
            ))}
            {!loading && guests.length === 0 && (
              <div className="guest-directory-empty"><ContactRound aria-hidden="true" /><strong>No guests found</strong><span>Try another search or create a new record.</span></div>
            )}
          </div>
        </aside>

        <div className="guest-record-panel">
          {draft ? (
            <form {...IGNORE_AUTOFILL} onSubmit={saveGuest}>
              <div className="guest-record-heading">
                <span className="guest-record-avatar"><UserRound aria-hidden="true" /></span>
                <div>
                  <span>{creating ? "New guest record" : "Guest record"}</span>
                  <h2>{draft.firstName || draft.lastName ? `${draft.firstName} ${draft.lastName}`.trim() : "Add a guest"}</h2>
                </div>
              </div>

              <div className="guest-record-fields">
                <label>First name<input {...IGNORE_AUTOFILL} required autoFocus={creating} value={draft.firstName} onChange={(event) => updateDraft("firstName", event.currentTarget.value)} onBlur={() => updateDraft("firstName", capitalizeNameInitial(draft.firstName))} /></label>
                <label>Last name<input {...IGNORE_AUTOFILL} value={draft.lastName} onChange={(event) => updateDraft("lastName", event.currentTarget.value)} onBlur={() => updateDraft("lastName", capitalizeNameInitial(draft.lastName))} /></label>
                <label><span><Phone aria-hidden="true" /> Phone</span><PhoneInput value={draft.phone} onChange={(value) => updateDraft("phone", value)} /></label>
                <label><span><Mail aria-hidden="true" /> Email</span><input {...IGNORE_AUTOFILL} type="text" inputMode="email" value={draft.email} onChange={(event) => updateDraft("email", event.currentTarget.value)} /></label>
                <label className="guest-field-wide"><span><Building2 aria-hidden="true" /> Company</span><input {...IGNORE_AUTOFILL} value={draft.company} onChange={(event) => updateDraft("company", event.currentTarget.value)} /></label>
                <label className="guest-field-wide">Guest notes<textarea {...IGNORE_AUTOFILL} rows={5} value={draft.notes} onChange={(event) => updateDraft("notes", event.currentTarget.value)} placeholder="Preferences and details to remember for future visits…" /></label>
              </div>

              <fieldset className="guest-record-tags">
                <legend><Tag aria-hidden="true" /> Guest tags</legend>
                <div className="guest-record-tag-options">
                  {GUEST_TAGS.map((tag) => (
                    <button type="button" key={tag} className={draft.tags.includes(tag) ? "selected" : ""} onClick={() => toggleTag(tag)}>
                      <TagIcon tag={tag} /><span>{tag}</span><Check className={draft.tags.includes(tag) ? "tag-selected-check" : "tag-selected-check tag-check-placeholder"} aria-hidden="true" />
                    </button>
                  ))}
                  {draft.tags.filter((tag) => !GUEST_TAGS.includes(tag)).map((tag) => (
                    <button type="button" key={tag} className="selected custom" onClick={() => toggleTag(tag)}><TagIcon tag={tag} /><span>{tag}</span><Check className="tag-selected-check" aria-hidden="true" /></button>
                  ))}
                </div>
                <div className="guest-custom-tag">
                  <input {...IGNORE_AUTOFILL} value={customTag} onChange={(event) => setCustomTag(event.currentTarget.value)} placeholder="Add a custom tag" onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addCustomTag(); } }} />
                  <button type="button" onClick={addCustomTag} disabled={!customTag.trim()}>Add</button>
                </div>
              </fieldset>

              {error && <div className="guest-record-error" role="alert">{error}</div>}
              <footer className="guest-record-actions">
                <span aria-live="polite">{saved ? <><Check aria-hidden="true" /> Saved</> : ""}</span>
                <button type="submit" disabled={saving || !draft.firstName.trim()}>
                  {saving && <LoaderCircle className="spin" aria-hidden="true" />}
                  {creating ? "Create guest" : "Save changes"}
                </button>
              </footer>
            </form>
          ) : (
            <div className="guest-record-placeholder">
              <ContactRound aria-hidden="true" />
              <h2>Select a guest</h2>
              <p>Choose a record from the directory to view or update it.</p>
              <button type="button" onClick={startGuest}><Plus aria-hidden="true" /> New guest</button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
