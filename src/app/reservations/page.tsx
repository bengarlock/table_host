import { ReservationsWorkspace } from "@/components/reservations-workspace";
import { validServiceDate, validShiftSlug } from "@/lib/service-navigation";

type ReservationsPageProps = {
  searchParams: Promise<{
    book?: string;
    date?: string | string[];
    shift?: string | string[];
  }>;
};

export default async function ReservationsPage({ searchParams }: ReservationsPageProps) {
  const params = await searchParams;
  return (
    <ReservationsWorkspace
      initiallyBookingOpen={params.book === "1"}
      initialServiceDate={validServiceDate(params.date)}
      initialShiftSlug={validShiftSlug(params.shift)}
    />
  );
}
