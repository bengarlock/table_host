import { ReservationsWorkspace } from "@/components/reservations-workspace";
import { validServiceDate, validShiftSlug } from "@/lib/service-navigation";
import { redirect } from "next/navigation";

type ReservationsPageProps = {
  searchParams: Promise<{
    book?: string;
    confirmation?: string | string[];
    date?: string | string[];
    shift?: string | string[];
  }>;
};

export default async function ReservationsPage({ searchParams }: ReservationsPageProps) {
  const params = await searchParams;
  if (params.book === "1") {
    const query = new URLSearchParams();
    const serviceDate = validServiceDate(params.date);
    const shiftSlug = validShiftSlug(params.shift);
    if (serviceDate) query.set("date", serviceDate);
    if (shiftSlug) query.set("shift", shiftSlug);
    redirect(`/reservations/book${query.size ? `?${query}` : ""}`);
  }
  return (
    <ReservationsWorkspace
      initialConfirmationId={positiveInteger(params.confirmation)}
      initialServiceDate={validServiceDate(params.date)}
      initialShiftSlug={validShiftSlug(params.shift)}
    />
  );
}

function positiveInteger(value: string | string[] | undefined) {
  const candidate = Array.isArray(value) ? value[0] : value;
  const parsed = Number(candidate);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}
