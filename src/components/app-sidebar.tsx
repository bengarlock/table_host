"use client";

import { Armchair, BookOpenText, CalendarPlus2, ContactRound } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { MouseEvent as ReactMouseEvent } from "react";
import hostStandIcon from "@/app/icon.png";

type AppSidebarProps = {
  onBookReservation?: () => void;
  onNavigateAttempt?: () => boolean;
};

export function AppSidebar({ onBookReservation, onNavigateAttempt }: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  function navigationAllowed() {
    return onNavigateAttempt?.() ?? true;
  }

  function guardNavigation(event: ReactMouseEvent<HTMLAnchorElement>) {
    if (!navigationAllowed()) event.preventDefault();
  }

  function bookReservation() {
    if (!navigationAllowed()) return;
    if (onBookReservation) {
      onBookReservation();
      return;
    }
    router.push("/reservations?book=1");
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
            <button
              type="button"
              className="nav-link nav-action"
              onClick={bookReservation}
              aria-label="Book a reservation"
              data-tooltip="Book a reservation"
            >
              <CalendarPlus2 className="nav-icon" aria-hidden="true" />
            </button>
          </li>
          <li>
            <Link
              className="nav-link"
              href="/reservations"
              onClick={guardNavigation}
              aria-label="Reservations"
              aria-current={pathname.startsWith("/reservations") ? "page" : undefined}
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
        </ul>
      </nav>
    </aside>
  );
}
