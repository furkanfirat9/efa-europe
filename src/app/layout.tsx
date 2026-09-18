import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import AppLayoutShell from "@/components/AppLayoutShell";

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Ozon AI Studio",
  description: "Ozon Marketplace Ürün Yükleme Sistemi",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" className={inter.variable}>
      <body className={`${inter.className} antialiased min-h-screen bg-canvas`}>
        <AppLayoutShell>
          {children}
        </AppLayoutShell>
      </body>
    </html>
  );
}
