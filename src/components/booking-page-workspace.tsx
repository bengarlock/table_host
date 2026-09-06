"use client";

import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { BookingWizard } from "@/components/booking-wizard";
import { appPath } from "@/lib/app-paths";
import { todayLocal } from "@/lib/service-navigation";

type ShiftChoice = {
  id: number;
  name: string;
  slug: string;
  start_time: string;
  end_time: string;
  default_turn_minutes: number;
};

type BookingSetup = {
  service_date: string;
  selected_shift: ShiftChoice;
  shifts: ShiftChoice[];
  tables: Array<{ capacity: number }>;
};

type BookingPageWorkspaceProps = {
  initialServiceDate?: string;
  initialShiftSlug?: string;
  initialTime?: string;
  initialPartySize?: number;
  initialDuration?: number;
  initialTableIds?: number[];
};

function reservationsUrl(serviceDate?: string, shiftSlug?: string, confirmationId?: number) {
  const query = new URLSearchParams();
  if (serviceDate) query.set("date", serviceDate);
  if (shiftSlug) query.set("shift", shiftSlug);
  if (confirmationId) query.set("confirmation", String(confirmationId));
  return `${appPath("/reservations")}${query.size ? `?${query}` : ""}`;
}

export function BookingPageWorkspace({
  initialServiceDate,
  initialShiftSlug,
  initialTime,
  initialPartySize,
  initialDuration,
  initialTableIds,
}: BookingPageWorkspaceProps) {
  const router = useRouter();
  const [setup, setSetup] = useState<BookingSetup | null>(null);
  const [error, setError] = useState("");

  const loadSetup = useCallback(async () => {
    setError("");
    const query = new URLSearchParams({ date: initialServiceDate || todayLocal() });
    if (initialShiftSlug) query.set("shift", initialShiftSlug);
    try {
      const response = await fetch(`${appPath("/api/grid")}?${query}`, { cache: "no-store" });
      const payload = (await response.json()) as BookingSetup | { detail?: string };
      if (!response.ok) {
        throw new Error("detail" in payload && payload.detail ? payload.detail : "Unable to prepare a new reservation.");
      }
      setSetup(payload as BookingSetup);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to prepare a new reservation.");
    }
  }, [initialServiceDate, initialShiftSlug]);

  useEffect(() => {
    // The booking setup is loaded once for the requested service context.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSetup();
  }, [loadSetup]);

  function returnToReservations(serviceDate?: string, shiftSlug?: string, confirmationId?: number) {
    router.push(reservationsUrl(serviceDate, shiftSlug, confirmationId));
  }

  return (
    <div className="app-shell">
      <AppSidebar />
      <main className="main-content booking-main-content">
        {setup ? (
          <BookingWizard
            initialDate={initialServiceDate || setup.service_date}
            initialShiftSlug={initialShiftSlug || setup.selected_shift.slug}
            initialDuration={initialDuration || setup.selected_shift.default_turn_minutes || 90}
            initialTime={initialTime}
            initialPartySize={initialPartySize}
            initialTableIds={initialTableIds}
            floorCoverCapacity={setup.tables.reduce((total, table) => total + table.capacity, 0)}
            shifts={setup.shifts}
            onClose={() => returnToReservations(setup.service_date, setup.selected_shift.slug)}
            onBooked={returnToReservations}
            presentation="page"
          />
        ) : error ? (
          <section className="booking-page-state" role="alert">
            <h1>New reservation</h1>
            <p>{error}</p>
            <button type="button" onClick={() => void loadSetup()}>Try again</button>
          </section>
        ) : (
          <div className="booking-page-state" role="status">
            <LoaderCircle className="spin" aria-hidden="true" />
            <p>Preparing a new reservation…</p>
          </div>
        )}
      </main>
    </div>
  );
}
