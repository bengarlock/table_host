"use client";

import { useState } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { ReservationGrid } from "@/components/reservation-grid";

export function ReservationsWorkspace() {
  const [bookingOpen, setBookingOpen] = useState(false);

  return (
    <div className="app-shell">
      <AppSidebar onBookReservation={() => setBookingOpen(true)} />
      <main className="main-content">
        <ReservationGrid bookingOpen={bookingOpen} onBookingOpenChange={setBookingOpen} />
      </main>
    </div>
  );
}
