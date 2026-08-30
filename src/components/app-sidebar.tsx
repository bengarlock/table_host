"use client";

import { BookOpenText, CalendarPlus2, ContactRound } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import hostStandIcon from "@/app/icon.png";

type AppSidebarProps = {
  onBookReservation?: () => void;
};

export function AppSidebar({ onBookReservation }: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  function bookReservation() {
    if (onBookReservation) {
      onBookReservation();
      return;
    }
    router.push("/reservations?book=1");
  }

  return (
    <aside className="sidebar" aria-label="Primary navigation">
      <Link className="brand" href="/reservations" aria-label="Table Host home">
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
              href="/guests"
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
