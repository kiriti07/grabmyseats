import type { Metadata } from "next";
import { Bebas_Neue, Inter } from "next/font/google";
import { AuthProvider } from "@/context/AuthContext";
import "./globals.css";

// Bebas Neue: a tall, condensed display face styled after mid-century
// theater marquee lettering - reads as cinema signage rather than generic
// SaaS branding, and stays legible at the small sizes a wordmark needs on
// a phone screen.
const bebasNeue = Bebas_Neue({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display",
});
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "GrabMySeats",
  description: "Buy and sell last-minute movie tickets, seat to seat.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${bebasNeue.variable} ${inter.variable} font-sans antialiased`}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
