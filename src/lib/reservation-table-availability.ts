export type ReservationFloorBooking = {
  id: number;
  table_id: number | null;
  table_ids: number[];
  guest_name: string;
  party_size: number;
  start_time: string;
  duration_minutes: number;
  status: string;
  assignment_type: "soft" | "hard";
};

function minutesFromTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function reservationOverlaps(
  reservation: ReservationFloorBooking,
  startTime: string,
  durationMinutes: number,
) {
  if (["cancelled", "complete"].includes(reservation.status)) return false;
  const targetStart = minutesFromTime(startTime);
  const targetEnd = targetStart + durationMinutes;
  const reservationStart = minutesFromTime(reservation.start_time);
  const reservationEnd = reservationStart + reservation.duration_minutes;
  return targetStart < reservationEnd && targetEnd > reservationStart;
}

export function reservationsByTable(reservations: ReservationFloorBooking[]) {
  const byTable = new Map<number, ReservationFloorBooking[]>();
  [...reservations]
    .sort((left, right) => left.start_time.localeCompare(right.start_time))
    .forEach((reservation) => {
      const tableIds = reservation.table_ids.length
        ? reservation.table_ids
        : reservation.table_id === null ? [] : [reservation.table_id];
      tableIds.forEach((tableId) => {
        byTable.set(tableId, [...(byTable.get(tableId) || []), reservation]);
      });
    });
  return byTable;
}
