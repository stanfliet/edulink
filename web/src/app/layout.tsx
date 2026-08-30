import type { Metadata } from "next";
import { Inter, Orbitron, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const orbitron = Orbitron({
  subsets: ["latin"],
  variable: "--font-orbitron",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
});

export const metadata: Metadata = {
  title: "EDULINK · k2020.org.za",
  description:
    "Multi-Tenant School Management · LMS · Public Health Tracking Network · Social Services Disciplinary System",
  applicationName: "EDULINK",
  keywords: ["EDULINK", "school management", "LMS", "POPIA", "South Africa"],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${orbitron.variable} ${jetbrains.variable} font-body`}>
        {children}
      </body>
    </html>
  );
}
