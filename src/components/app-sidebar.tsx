import { BookOpenText } from "lucide-react";
import Link from "next/link";

export function AppSidebar() {
  return (
    <aside className="sidebar" aria-label="Primary navigation">
      <Link className="brand" href="/reservations" aria-label="Table Host home">
        <span className="brand-mark" aria-hidden="true">TH</span>
        <span className="brand-copy">
          <span className="brand-name">Table Host</span>
          <span className="brand-label">Service console</span>
        </span>
      </Link>

      <nav className="sidebar-nav">
        <p className="nav-eyebrow">Workspace</p>
        <ul className="nav-list">
          <li>
            <Link className="nav-link" href="/reservations" aria-current="page">
              <BookOpenText className="nav-icon" aria-hidden="true" />
              <span className="nav-text">Reservations</span>
            </Link>
          </li>
        </ul>
      </nav>

      <div className="venue-card" aria-label="Current venue">
        <span className="venue-label">Current venue</span>
        <span className="venue-name">No restaurant selected</span>
      </div>
    </aside>
  );
}
