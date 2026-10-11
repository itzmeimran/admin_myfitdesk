import "server-only";
import { cache } from "react";
import { createClient } from "@/core/db/server-client";
import { getGymDetail } from "@/features/gyms/detail";

/** The gym layout and the Overview page both need the same `admin_gym_detail`
 * read; `cache` makes them share one request per render. */
export const getGymCached = cache(async (id: string) => getGymDetail(await createClient(), id));
