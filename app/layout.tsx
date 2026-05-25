import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "AutoMark",
  description: "AI-powered long-form answer marking",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "AutoMark" },
};

export const viewport: Viewport = {
  themeColor: "#4F46E5",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="h-full font-sans antialiased">
        {/* Apply saved accent before paint to avoid a flash */}
        <Script id="accent-init" strategy="beforeInteractive">
          {`try{var s=JSON.parse(localStorage.getItem('automark.settings')||'{}');if(s.accent)document.documentElement.dataset.accent=s.accent;}catch(e){}`}
        </Script>

        {children}

        {/* Register the PWA service worker */}
        <Script id="sw-register" strategy="afterInteractive">
          {`if('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js')`}
        </Script>
      </body>
    </html>
  );
}
