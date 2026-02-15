import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import localFont from "next/font/local";
import Nav from "@/components/nav";
import Footer from "@/components/footer";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
});

const jetbrainsMono = localFont({
  src: [
    {
      path: "../../public/fonts/JetBrainsMono-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../public/fonts/JetBrainsMono-Medium.woff2",
      weight: "500",
      style: "normal",
    },
  ],
  variable: "--font-jetbrains",
});

export const metadata: Metadata = {
  title: "Motive Hosting",
  description: "Customer Hub — Domain registration and DNS management for Gulf Coast businesses",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${playfair.variable} ${jetbrainsMono.variable} font-sans antialiased`}
      >
        <ToastProvider>
          <Nav />
          <main className="min-h-[calc(100vh-3.5rem-4rem)]">{children}</main>
          <Footer />
        </ToastProvider>
      </body>
    </html>
  );
}
