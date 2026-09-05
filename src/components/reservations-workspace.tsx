"use client";

import { useRef } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { ReservationGrid } from "@/components/reservation-grid";

type ReservationsWorkspaceProps = {
  initialConfirmationId?: number;
  initialServiceDate?: string;
  initialShiftSlug?: string;
};

export function ReservationsWorkspace({
  initialConfirmationId,
  initialServiceDate,
  initialShiftSlug,
}: ReservationsWorkspaceProps) {
  const navigationStartedRef = useRef(false);

  return (
    <div className="app-shell">
      <AppSidebar onNavigateAttempt={(destination) => {
        navigationStartedRef.current = destination !== "/reservations";
        return true;
      }} />
      <main className="main-content">
        <ReservationGrid
          initialConfirmationId={initialConfirmationId}
          initialServiceDate={initialServiceDate}
          initialShiftSlug={initialShiftSlug}
          shouldSyncServiceUrl={() => !navigationStartedRef.current}
        />
      </main>
    </div>
  );
}
