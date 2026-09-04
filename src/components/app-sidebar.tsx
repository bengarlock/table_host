"use client";

import { Armchair, BookOpenText, CalendarPlus2, ContactRound, Settings } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { MouseEvent as ReactMouseEvent } from "react";
import hostStandIcon from "@/app/icon.png";

type AppSidebarProps = {
  onNavigateAttempt?: (destination: string) => boolean;
};

export function AppSidebar({ onNavigateAttempt }: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const bookingPageActive = pathname === "/reservations/book";
  const reservationsPageActive = pathname === "/reservations";
  const settingsPageActive = pathname.startsWith("/settings");

  function navigationAllowed(destination: string) {
    return onNavigateAttempt?.(destination) ?? true;
  }

  function guardNavigation(
    event: ReactMouseEvent<HTMLAnchorElement>,
    destination: string,
    preserveServiceContext = false,
  ) {
    if (!navigationAllowed(destination)) {
      event.preventDefault();
      return;
    }
    if (!preserveServiceContext || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const current = new URL(window.location.href);
    const query = new URLSearchParams();
    const serviceDate = current.searchParams.get("date");
    const shiftSlug = current.searchParams.get("shift");
    if (serviceDate) query.set("date", serviceDate);
    if (shiftSlug) query.set("shift", shiftSlug);
    if (!query.size) return;

    event.preventDefault();
    router.push(`${destination}?${query}`);
  }

  return (
    <aside className="sidebar" aria-label="Primary navigation">
      <Link className="brand" href="/reservations" aria-label="Table Host home" onClick={(event) => guardNavigation(event, "/reservations")}>
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
              onClick={(event) => guardNavigation(event, "/reservations/book", true)}
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
              onClick={(event) => guardNavigation(event, "/reservations", true)}
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
              onClick={(event) => guardNavigation(event, "/floor")}
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
              onClick={(event) => guardNavigation(event, "/guests")}
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
              href="/settings/general"
              onClick={(event) => guardNavigation(event, "/settings/general")}
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
