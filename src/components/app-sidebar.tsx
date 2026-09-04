"use client";

import { Armchair, BookOpenText, CalendarPlus2, ContactRound, Settings } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MouseEvent as ReactMouseEvent } from "react";
import hostStandIcon from "@/app/icon.png";

type AppSidebarProps = {
  onNavigateAttempt?: () => boolean;
};

export function AppSidebar({ onNavigateAttempt }: AppSidebarProps) {
  const pathname = usePathname();
  const bookingPageActive = pathname === "/reservations/book";
  const reservationsPageActive = pathname === "/reservations";
  const settingsPageActive = pathname.startsWith("/settings");

  function navigationAllowed() {
    return onNavigateAttempt?.() ?? true;
  }

  function guardNavigation(event: ReactMouseEvent<HTMLAnchorElement>) {
    if (!navigationAllowed()) event.preventDefault();
  }

  return (
    <aside className="sidebar" aria-label="Primary navigation">
      <Link className="brand" href="/reservations" aria-label="Table Host home" onClick={guardNavigation}>
        <Image
          className="brand-mark"
          src={hostStandIcon}
          width={46}
          height={46}
          alt=""
          priority
        />
      </Link>

      <nav className="sidebar-nav">
        <ul className="nav-list">
          <li>
            <Link
              className="nav-link"
              href="/reservations/book"
              onClick={guardNavigation}
              aria-label="Book a reservation"
              aria-current={bookingPageActive ? "page" : undefined}
              data-tooltip="Book a reservation"
            >
              <CalendarPlus2 className="nav-icon" aria-hidden="true" />
            </Link>
          </li>
          <li>
            <Link
              className="nav-link"
              href="/reservations"
              onClick={guardNavigation}
              aria-label="Reservations"
              aria-current={reservationsPageActive ? "page" : undefined}
              data-tooltip="Reservations"
            >
              <BookOpenText className="nav-icon" aria-hidden="true" />
            </Link>
          </li>
          <li>
            <Link
              className="nav-link"
              href="/floor"
              aria-label="Floor plan"
              aria-current={pathname.startsWith("/floor") ? "page" : undefined}
              data-tooltip="Floor plan"
            >
              <Armchair className="nav-icon" aria-hidden="true" />
            </Link>
          </li>
          <li>
            <Link
              className="nav-link"
              href="/guests"
              onClick={guardNavigation}
              aria-label="Guest management"
              aria-current={pathname.startsWith("/guests") ? "page" : undefined}
              data-tooltip="Guests"
            >
              <ContactRound className="nav-icon" aria-hidden="true" />
            </Link>
          </li>
          <li>
            <Link
              className="nav-link"
              href="/settings"
              onClick={guardNavigation}
              aria-label="Settings"
              aria-current={settingsPageActive ? "page" : undefined}
              data-tooltip="Settings"
            >
              <Settings className="nav-icon" aria-hidden="true" />
            </Link>
          </li>
        </ul>
      </nav>
    </aside>
  );
}
