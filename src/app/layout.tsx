import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

const description =
  "Discover your local farm group — and see the river catchments and basins your land shares — on one map.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Facilitator Forum by Soil Benchmark",
    template: "%s · Facilitator Forum",
  },
  description,
  applicationName: "Facilitator Forum",
  openGraph: {
    title: "Facilitator Forum by Soil Benchmark",
    description,
    siteName: "Facilitator Forum",
    url: "/",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Facilitator Forum by Soil Benchmark",
    description,
  },
};

export const viewport: Viewport = {
  themeColor: "#23263a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
