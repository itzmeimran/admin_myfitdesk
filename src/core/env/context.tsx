"use client";

import { createContext, useContext } from "react";
import type { AdminEnvironment } from "@/core/config/environments";

const AdminEnvironmentContext = createContext<AdminEnvironment | null>(null);

/**
 * Makes the server-resolved active environment (core/env/active-environment.ts)
 * available to Client Components without each one re-deriving it from
 * `document.cookie`. Mounted once, at the root layout, from the same
 * `admin-env` cookie read every server-side Supabase client factory uses —
 * so a Client Component's idea of "which environment am I in" can never
 * drift from the one the server actually fetched data from.
 */
export function AdminEnvironmentProvider({
  environment,
  children,
}: {
  environment: AdminEnvironment;
  children: React.ReactNode;
}) {
  return <AdminEnvironmentContext.Provider value={environment}>{children}</AdminEnvironmentContext.Provider>;
}

export function useAdminEnvironment(): AdminEnvironment {
  const value = useContext(AdminEnvironmentContext);
  if (value === null) {
    throw new Error("useAdminEnvironment() must be used within <AdminEnvironmentProvider>.");
  }
  return value;
}
