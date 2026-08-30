import { BookOpenText } from "lucide-react";
import { AppSidebar } from "@/components/app-sidebar";

export default function ReservationsPage() {
  return (
    <div className="app-shell">
      <AppSidebar />
      <main className="main-content">
        <div className="page-wrap">
          <header>
            <p className="page-eyebrow">Reservations</p>
            <h1 className="page-title">The evening book</h1>
            <p className="page-description">
              A focused workspace for service notes, guest arrivals, and the flow of the room.
              Reservation tools will take shape here next.
            </p>
          </header>

          <section className="workspace-preview" aria-label="Reservation workspace preview">
            <div className="empty-state">
              <span className="empty-icon" aria-hidden="true">
                <BookOpenText />
              </span>
              <h2 className="empty-title">Your reservation book is ready</h2>
              <p className="empty-copy">
                The navigation foundation is in place. Dates, covers, guest details, and table
                assignments will live in this workspace.
              </p>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
