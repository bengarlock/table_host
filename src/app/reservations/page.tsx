import { AppSidebar } from "@/components/app-sidebar";
import { ReservationGrid } from "@/components/reservation-grid";

export default function ReservationsPage() {
  return (
    <div className="app-shell">
      <AppSidebar />
      <main className="main-content">
        <ReservationGrid />
      </main>
    </div>
  );
}
