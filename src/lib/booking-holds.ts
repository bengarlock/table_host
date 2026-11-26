"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { appPath } from "@/lib/app-paths";
import { getBackendBaseUrl } from "@/lib/backend";

export type BookingHold = {
  id: number;
  service_date: string;
  shift_slug: string;
  start_time: string;
  duration_minutes: number;
  party_size: number;
  table_ids: number[];
  table_names: string[];
  expires_at: string;
  is_training: boolean;
};

export type HoldEvent =
  | { type: "hold.created" | "hold.updated"; hold: BookingHold }
  | { type: "hold.released"; hold: BookingHold; reason: string };

export type PlaceHoldRequest = {
  service_date: string;
  shift_slug: string;
  start_time: string;
  duration_minutes: number;
  party_size: number;
  table_ids: number[];
};

export type PlaceHoldResult =
  | { status: "held"; hold: BookingHold; renewIntervalSeconds: number }
  | { status: "conflict"; detail: string }
  | { status: "error"; detail: string };

/* ---------- Per-tab identity and the holds this tab owns ---------- */

let tabHolderToken: string | null = null;

/** A random token identifying this browser tab's booking session. */
export function getTabHolderToken(): string {
  if (!tabHolderToken) {
    tabHolderToken = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  }
  return tabHolderToken;
}

const ownHoldIds = new Set<number>();
let ownHoldsVersion = 0;
const ownHoldListeners = new Set<() => void>();

function setOwnHolds(ids: number[]) {
  ownHoldIds.clear();
  ids.forEach((id) => ownHoldIds.add(id));
  ownHoldsVersion += 1;
  ownHoldListeners.forEach((listener) => listener());
}

export function isOwnHold(holdId: number) {
  return ownHoldIds.has(holdId);
}

function subscribeOwnHolds(listener: () => void) {
  ownHoldListeners.add(listener);
  return () => { ownHoldListeners.delete(listener); };
}

/** Re-renders the caller whenever this tab gains or drops a hold. */
export function useOwnHoldsVersion() {
  return useSyncExternalStore(subscribeOwnHolds, () => ownHoldsVersion, () => 0);
}

/* ---------- REST calls ---------- */

function readDetail(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (typeof record.detail === "string") return record.detail;
    const first = Object.values(record).flat()[0];
    if (typeof first === "string") return first;
  }
  return fallback;
}

export async function placeHold(request: PlaceHoldRequest): Promise<PlaceHoldResult> {
  try {
    const response = await fetch(appPath("/api/grid/holds"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...request, holder_token: getTabHolderToken() }),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (response.status === 409) {
      setOwnHolds([]);
      return { status: "conflict", detail: readDetail(payload, "Another host is booking that table right now.") };
    }
    if (!response.ok || !payload) {
      return { status: "error", detail: readDetail(payload, "Unable to hold that time.") };
    }
    const hold = payload.hold as BookingHold;
    setOwnHolds([hold.id]);
    return {
      status: "held",
      hold,
      renewIntervalSeconds: Number(payload.renew_interval_seconds) || 30,
    };
  } catch {
    return { status: "error", detail: "Unable to reach the reservation service." };
  }
}

/** Extends this tab's holds. Returns false when the hold has already expired. */
export async function renewHolds(): Promise<boolean> {
  try {
    const response = await fetch(appPath("/api/grid/holds/renew"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ holder_token: getTabHolderToken() }),
      cache: "no-store",
    });
    if (response.status === 404) {
      setOwnHolds([]);
      return false;
    }
    return true;
  } catch {
    return true; // A network blip is not an expiry; the next renewal will retry.
  }
}

/** Releases every hold this tab owns. Uses keepalive so it survives page unloads. */
export function releaseHolds() {
  if (!ownHoldIds.size) return;
  setOwnHolds([]);
  const query = new URLSearchParams({ holder_token: getTabHolderToken() });
  void fetch(`${appPath("/api/grid/holds")}?${query}`, {
    method: "DELETE",
    keepalive: true,
    cache: "no-store",
  }).catch(() => undefined);
}

/* ---------- Live updates over WebSocket ---------- */

/**
 * Deployed builds connect to the host that served the page, where nginx routes
 * /ws/ to Daphne (production and DS9 staging alike). Local development talks
 * to the Django dev server directly unless NEXT_PUBLIC_WS_URL overrides it.
 */
export function holdsWebSocketUrl(serviceDate: string) {
  const configured = process.env.NEXT_PUBLIC_WS_URL?.trim();
  let base: string;
  if (configured) {
    base = configured;
  } else if (process.env.NODE_ENV === "production" && typeof window !== "undefined") {
    base = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`;
  } else {
    base = getBackendBaseUrl();
  }
  base = base.replace(/^http/, "ws").replace(/\/$/, "");
  return `${base}/ws/tablehost/holds/?date=${encodeURIComponent(serviceDate)}`;
}

function isLive(hold: BookingHold, now: number) {
  return new Date(hold.expires_at).getTime() > now;
}

/**
 * Subscribes to every booking hold for a service date. Reconnects with backoff,
 * and drops holds locally once they pass their expiry so an abandoned browser
 * never blocks a slot here for longer than the hold itself lasts.
 */
export function useLiveHolds(serviceDate: string | null, onEvent?: (event: HoldEvent) => void) {
  const [holdsById, setHoldsById] = useState<Map<number, BookingHold>>(() => new Map());
  const [connected, setConnected] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const onEventRef = useRef(onEvent);

  useEffect(() => { onEventRef.current = onEvent; }, [onEvent]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 5_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!serviceDate || typeof WebSocket === "undefined") return;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let pingTimer: number | undefined;
    let attempts = 0;
    let closed = false;

    function connect() {
      socket = new WebSocket(holdsWebSocketUrl(serviceDate!));
      socket.onopen = () => {
        attempts = 0;
        setConnected(true);
        pingTimer = window.setInterval(() => {
          if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "ping" }));
        }, 25_000);
      };
      socket.onmessage = (message) => {
        let data: Record<string, unknown>;
        try {
          data = JSON.parse(String(message.data));
        } catch {
          return;
        }
        if (data.type === "holds.snapshot" && Array.isArray(data.holds)) {
          setHoldsById(new Map((data.holds as BookingHold[]).map((hold) => [hold.id, hold])));
          return;
        }
        if (data.type !== "hold.created" && data.type !== "hold.updated" && data.type !== "hold.released") return;
        const event = data as HoldEvent;
        setHoldsById((current) => {
          const next = new Map(current);
          if (event.type === "hold.released") next.delete(event.hold.id);
          else next.set(event.hold.id, event.hold);
          return next;
        });
        onEventRef.current?.(event);
      };
      socket.onclose = () => {
        setConnected(false);
        window.clearInterval(pingTimer);
        if (closed) return;
        attempts += 1;
        reconnectTimer = window.setTimeout(connect, Math.min(30_000, 1_000 * 2 ** Math.min(attempts, 5)));
      };
    }

    connect();
    return () => {
      closed = true;
      window.clearTimeout(reconnectTimer);
      window.clearInterval(pingTimer);
      socket?.close();
      setHoldsById(new Map());
      setConnected(false);
    };
  }, [serviceDate]);

  const ownVersion = useOwnHoldsVersion();
  const holds = useMemo(
    () => [...holdsById.values()].filter((hold) => isLive(hold, now) && !isOwnHold(hold.id)),
    // ownVersion re-filters when this tab gains or drops a hold.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [holdsById, now, ownVersion],
  );

  return { holds, connected };
}

export function holdOverlaps(hold: BookingHold, shiftSlug: string, startTime: string, durationMinutes: number) {
  if (hold.shift_slug !== shiftSlug) return false;
  const toMinutes = (value: string) => {
    const [hour, minute] = value.split(":").map(Number);
    return hour * 60 + minute;
  };
  const start = toMinutes(startTime);
  const holdStart = toMinutes(hold.start_time);
  return start < holdStart + hold.duration_minutes && start + durationMinutes > holdStart;
}
