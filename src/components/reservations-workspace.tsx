"use client";

import { useState } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { ReservationGrid } from "@/components/reservation-grid";

type ReservationsWorkspaceProps = {
  initiallyBookingOpen?: boolean;
  initialServiceDate?: string;
  initialShiftSlug?: string;
};

export function ReservationsWorkspace({
  initiallyBookingOpen = false,
  initialServiceDate,
  initialShiftSlug,
}: ReservationsWorkspaceProps) {
  const [bookingOpen, setBookingOpen] = useState(initiallyBookingOpen);

  function changeBookingOpen(open: boolean) {
    setBookingOpen(open);
    if (!open && initiallyBookingOpen) {
      const url = new URL(window.location.href);
      url.searchParams.delete("book");
      window.history.replaceState(null, "", `${url.pathname}?${url.searchParams.toString()}${url.hash}`);
    }
  }

  return (
    <div className="app-shell">
      <AppSidebar onBookReservation={() => setBookingOpen(true)} />
      <main className="main-content">
        <ReservationGrid
          bookingOpen={bookingOpen}
          onBookingOpenChange={changeBookingOpen}
          initialServiceDate={initialServiceDate}
          initialShiftSlug={initialShiftSlug}
        />
      </main>
    </div>
  );
}
