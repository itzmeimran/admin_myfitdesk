"use client";

import { useSearchParams } from "next/navigation";
import { Dropdown } from "@/components/Dropdown";
import { useNavigationPending } from "@/components/NavigationPending";

const columns = [["name", "Gym"], ["owner_name", "Owner"], ["package_name", "Plan"], ["state", "Status"], ["member_count", "Members"], ["current_period_end", "Next date"], ["lifetime_paid_minor", "Total collected"]];
export function GymSortControl({ sortCol, sortDir }: { sortCol: string; sortDir: string }) {
  const searchParams = useSearchParams();
  const { pending, navigate } = useNavigationPending();
  return <div className="flex max-w-full items-center gap-2 text-[11px] text-mute md:hidden">
    <span>Sort by</span><div className="min-w-0 flex-1"><Dropdown size="sm" ariaLabel="Sort gyms" pending={pending} value={`${sortCol}:${sortDir}`} options={columns.flatMap(([value, label]) => [
      { value: `${value}:asc`, label: `${label} · Ascending` }, { value: `${value}:desc`, label: `${label} · Descending` },
    ])} onChange={value => {
      const [sort, dir] = value.split(":");
      const params = new URLSearchParams(searchParams.toString());
      params.set("sort", sort); params.set("dir", dir); params.delete("page");
      navigate(`/admin/gyms?${params}`, { scroll: false });
    }} /></div>
  </div>;
}
