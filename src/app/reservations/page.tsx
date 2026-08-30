import { ReservationsWorkspace } from "@/components/reservations-workspace";

type ReservationsPageProps = {
  searchParams: Promise<{ book?: string }>;
};

export default async function ReservationsPage({ searchParams }: ReservationsPageProps) {
  const params = await searchParams;
  return <ReservationsWorkspace initiallyBookingOpen={params.book === "1"} />;
}
