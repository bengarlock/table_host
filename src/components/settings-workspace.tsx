import { Armchair, CalendarClock, Rows3 } from "lucide-react";
import Link from "next/link";
import { AppSidebar } from "@/components/app-sidebar";

const SETTINGS_SECTIONS = [
  { href: "/settings", label: "Floor, Sheets and Schedules" },
];

export function SettingsWorkspace() {
  return (
    <div className="app-shell">
      <AppSidebar />
      <main className="main-content settings-main-content">
        <div className="settings-page">
          <header className="settings-header">
            <p>Restaurant setup</p>
            <h1>Settings</h1>
            <span>Configure the structure behind reservations and daily service.</span>
          </header>

          <nav className="settings-section-nav" aria-label="Settings sections">
            <ul>
              {SETTINGS_SECTIONS.map((section) => (
                <li key={section.href}>
                  <Link href={section.href} aria-current="page">
                    {section.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <section className="settings-section" aria-labelledby="floor-sheets-schedules-title">
            <header className="settings-section-header">
              <p>Operations</p>
              <h2 id="floor-sheets-schedules-title">Floor, Sheets and Schedules</h2>
              <span>Manage the spaces, reservation windows, and service times that shape each day.</span>
            </header>

            <div className="settings-topic-grid">
              <article>
                <Armchair aria-hidden="true" />
                <div>
                  <h3>Floor</h3>
                  <p>Dining areas, tables, capacities, and seating layouts.</p>
                </div>
              </article>
              <article>
                <Rows3 aria-hidden="true" />
                <div>
                  <h3>Sheets</h3>
                  <p>Reservation sheets, booking windows, and turn-time defaults.</p>
                </div>
              </article>
              <article>
                <CalendarClock aria-hidden="true" />
                <div>
                  <h3>Schedules</h3>
                  <p>Service days, shift times, and operating hours.</p>
                </div>
              </article>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
