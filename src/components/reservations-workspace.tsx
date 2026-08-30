"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { ReservationGrid } from "@/components/reservation-grid";

type ReservationsWorkspaceProps = {
  initiallyBookingOpen?: boolean;
};

export function ReservationsWorkspace({ initiallyBookingOpen = false }: ReservationsWorkspaceProps) {
  const router = useRouter();
  const [bookingOpen, setBookingOpen] = useState(initiallyBookingOpen);

  function changeBookingOpen(open: boolean) {
    setBookingOpen(open);
    if (!open && initiallyBookingOpen) router.replace("/reservations", { scroll: false });
  }

  return (
    <div className="app-shell">
      <AppSidebar onBookReservation={() => setBookingOpen(true)} />
      <main className="main-content">
        <ReservationGrid bookingOpen={bookingOpen} onBookingOpenChange={changeBookingOpen} />
      </main>
    </div>
  );
}
