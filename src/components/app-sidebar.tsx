import { BookOpenText } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import hostStandIcon from "@/app/icon.png";

export function AppSidebar() {
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
            <Link
              className="nav-link"
              href="/reservations"
              aria-label="Reservations"
              aria-current="page"
              data-tooltip="Reservations"
            >
              <BookOpenText className="nav-icon" aria-hidden="true" />
            </Link>
          </li>
        </ul>
      </nav>
    </aside>
  );
}
