import { FloorWorkspace } from "@/components/floor-workspace";
import { validServiceDate, validShiftSlug } from "@/lib/service-navigation";

type FloorPageProps = {
  searchParams: Promise<{ date?: string | string[]; shift?: string | string[] }>;
};

export default async function FloorPage({ searchParams }: FloorPageProps) {
  const params = await searchParams;
  return (
    <FloorWorkspace
      initialServiceDate={validServiceDate(params.date)}
      initialShiftSlug={validShiftSlug(params.shift)}
    />
  );
}
