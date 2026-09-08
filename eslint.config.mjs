import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // The service client bypasses RLS — in this admin app it's the whole
    // point (cross-tenant aggregate reads platform_admins predicate can't
    // scope with per-org RLS), but it must only be reached from server-only
    // query modules that have already checked platform-admin authorization
    // (src/app/admin/layout.tsx), never from a feature's client-facing code
    // path. Same boundary FitDeskApp enforces, adjusted for this app not
    // having a `features/**` split yet beyond mock-data modules.
    files: ["src/features/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/core/db/service-client", "@/core/db/service-client"],
              message:
                "features/** must not import the service client directly — route cross-tenant reads through a query module that has already verified platform-admin authorization.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
