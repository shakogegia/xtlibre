import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "XTLibre",
  description: "Convert EPUB e-books to XTC format for XTEInk e-readers",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "XTLibre",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport = {
  viewportFit: "cover" as const,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
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
      suppressHydrationWarning
    >
      <head />
      <body className="h-full overflow-hidden font-sans">
        <ThemeProvider>
          <TooltipProvider>
            {children}
          </TooltipProvider>
        </ThemeProvider>
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}
