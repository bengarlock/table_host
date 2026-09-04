import { BookingPageWorkspace } from "@/components/booking-page-workspace";
import { validServiceDate, validShiftSlug } from "@/lib/service-navigation";

type BookingPageProps = {
  searchParams: Promise<{
    date?: string | string[];
    shift?: string | string[];
  }>;
};

export default async function BookingPage({ searchParams }: BookingPageProps) {
  const params = await searchParams;
  return (
    <BookingPageWorkspace
      initialServiceDate={validServiceDate(params.date)}
      initialShiftSlug={validShiftSlug(params.shift)}
    />
  );
}
