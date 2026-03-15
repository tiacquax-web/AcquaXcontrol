import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ClientThemeProvider from "@/components/ClientThemeProvider";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import PwaInstallBanner from "@/components/PwaInstallBanner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AcquaxControl Biblioteca",
  description: "Aplicativo AcquaxControl para iPhone e Android",
  manifest: "/manifest.webmanifest",
  applicationName: "AcquaxControl Biblioteca",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "AcquaxControl Biblioteca",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon-180.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0ea5e9",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <ServiceWorkerRegister />
        <PwaInstallBanner />
        <ClientThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange>
          {children}
        </ClientThemeProvider>
      </body>
    </html>
  );
}
