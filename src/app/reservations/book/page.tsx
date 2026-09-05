import { BookingPageWorkspace } from "@/components/booking-page-workspace";
import { validServiceDate, validShiftSlug } from "@/lib/service-navigation";

type BookingPageProps = {
  searchParams: Promise<{
    date?: string | string[];
    shift?: string | string[];
    time?: string | string[];
    party_size?: string | string[];
    duration?: string | string[];
    tables?: string | string[];
  }>;
};

export default async function BookingPage({ searchParams }: BookingPageProps) {
  const params = await searchParams;
  return (
    <BookingPageWorkspace
      initialServiceDate={validServiceDate(params.date)}
      initialShiftSlug={validShiftSlug(params.shift)}
      initialTime={validTime(params.time)}
      initialPartySize={positiveInteger(params.party_size, 32_767)}
      initialDuration={turnDuration(params.duration)}
      initialTableIds={tableIds(params.tables)}
    />
  );
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function positiveInteger(value: string | string[] | undefined, maximum: number) {
  const parsed = Number(firstValue(value));
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= maximum ? parsed : undefined;
}

function validTime(value: string | string[] | undefined) {
  const candidate = firstValue(value);
  return typeof candidate === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(candidate)
    ? candidate
    : undefined;
}

function turnDuration(value: string | string[] | undefined) {
  const duration = positiveInteger(value, 360);
  return duration && duration >= 15 && duration % 15 === 0 ? duration : undefined;
}

function tableIds(value: string | string[] | undefined) {
  const candidate = firstValue(value);
  if (!candidate) return [];
  const ids = candidate.split(",").map(Number);
  return ids.every((id) => Number.isSafeInteger(id) && id > 0)
    ? [...new Set(ids)]
    : [];
}
