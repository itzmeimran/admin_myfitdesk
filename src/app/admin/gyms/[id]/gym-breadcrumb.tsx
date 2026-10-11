import { ButtonLink } from "@/components/ButtonLink";
import { ChevronIcon } from "@/core/ui/icons";
import { PILL_CLASS, pillTone } from "@/core/ui/status-style";
import { EnvironmentPill } from "../../environment-pill";
import { LiveIndicator } from "./live-indicator";

/**
 * Gyms → Gym name, pinned to the top of the page while any tab scrolls so the
 * gym, its status and the environment stay visible. The environment pill is
 * the project (Development / Production); the status pill is the gym's own.
 */
export function GymBreadcrumb({ name, status, gymCode }: { name: string; status: string; gymCode: string }) {
  return (
      <div className="sticky top-0 z-20 -mx-4 -mt-5 flex h-10 items-center justify-between gap-3 border-b border-line bg-paper px-4 md:-mx-6 md:-mt-6 md:px-6">
        <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
          <ol className="flex min-w-0 items-center gap-1.5 text-[12.5px]">
            <li className="flex-shrink-0">
              <ButtonLink variant="text" href="/admin/gyms" className="font-bold text-mute hover:text-ink">
                Gyms
              </ButtonLink>
            </li>
            <li aria-hidden="true" className="flex-shrink-0 text-mute">
              <ChevronIcon size={12} className="-rotate-90" />
            </li>
            <li aria-current="page" className="flex min-w-0 items-center gap-2">
              <span className="truncate font-bold text-ink">{name}</span>
              <span className="hidden flex-shrink-0 sm:block">
                <span className={PILL_CLASS} style={pillTone(status)}>
                  {status}
                </span>
              </span>
              <span className="hidden flex-shrink-0 font-mono text-[11.5px] text-mute md:inline">{gymCode}</span>
            </li>
          </ol>
        </nav>
        <div className="flex flex-shrink-0 items-center gap-2.5">
          <span className="hidden sm:block">
            <EnvironmentPill compact />
          </span>
          <LiveIndicator />
        </div>
      </div>
  );
}
