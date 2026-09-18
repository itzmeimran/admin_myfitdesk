import type { Metadata } from "next";
import { Archivo_Black, Space_Grotesk } from "next/font/google";
import { getActiveAdminEnvironment } from "@/core/env/active-environment";
import { AdminEnvironmentProvider } from "@/core/env/context";
import "./globals.css";

const archivoBlack = Archivo_Black({
  variable: "--font-archivo-black",
  weight: "400",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MyFitDesk — Platform Admin",
  description: "Platform back-office for the team operating MyFitDesk.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const environment = await getActiveAdminEnvironment();

  return (
    <html
      lang="en"
      className={`${archivoBlack.variable} ${spaceGrotesk.variable} h-full antialiased`}
      data-admin-env={environment}
    >
      <body className="min-h-full flex flex-col bg-sand text-ink">
        <AdminEnvironmentProvider environment={environment}>{children}</AdminEnvironmentProvider>
      </body>
    </html>
  );
}
