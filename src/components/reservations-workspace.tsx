import { AppSidebar } from "@/components/app-sidebar";
import { ReservationGrid } from "@/components/reservation-grid";

type ReservationsWorkspaceProps = {
  initialServiceDate?: string;
  initialShiftSlug?: string;
};

export function ReservationsWorkspace({
  initialServiceDate,
  initialShiftSlug,
}: ReservationsWorkspaceProps) {
  return (
    <div className="app-shell">
      <AppSidebar />
      <main className="main-content">
        <ReservationGrid
          initialServiceDate={initialServiceDate}
          initialShiftSlug={initialShiftSlug}
        />
      </main>
    </div>
  );
}
