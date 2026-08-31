import type { Metadata, Viewport } from "next";
import "./globals.css";
import { RAF_FALLBACK_SNIPPET } from "@/lib/raf-fallback";
import Header from "@/components/layout/Header";
import BottomTabs from "@/components/layout/BottomTabs";
import Footer from "@/components/layout/Footer";
import SearchModal from "@/components/search/SearchModal";

export const metadata: Metadata = {
  title: {
    default: "远征手账 遠征手帳|全日本 Live 情报",
    template: "%s|远征手账",
  },
  description:
    "面向日音人的全日本演唱会/Live 情报站：官方来源核验、地图探索、售票时间线与场馆信息。",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b14" },
  ],
};

const themeInit = `(function(){try{var t=localStorage.getItem("ensei-theme");var d=t?t==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;if(d)document.documentElement.classList.add("dark")}catch(e){}})()`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning className="h-full">
      <head>
        <script dangerouslySetInnerHTML={{ __html: RAF_FALLBACK_SNIPPET }} />
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="flex min-h-full flex-col bg-surface text-zinc-900 antialiased dark:bg-surface-dark dark:text-zinc-100">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
        <BottomTabs />
        <SearchModal />
      </body>
    </html>
  );
}
