"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, ArrowUpRight } from "lucide-react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import BottomTabs from "@/components/layout/BottomTabs";
import ThemeToggle from "@/components/layout/ThemeToggle";
import FrontendSwitch from "./FrontendSwitch";
import { useFrontend } from "./frontend-store";
import LocalStorageBoundary from "./LocalStorageBoundary";

const NAV = [["/", "手账首页", "01"], ["/events", "发现公演", "02"], ["/applications", "抽选记录", "03"], ["/trips", "我的远征", "04"], ["/me", "个人手账", "05"]] as const;
export default function FrontendFrame({ children }: { children: ReactNode }) {
  const mode = useFrontend();
  const pathname = usePathname();
  const paper = mode === "paper";
  return <>
    {paper ? <header className="paper-header site-header"><div className="paper-header-inner">
      <Link href="/" className="paper-brand"><span className="paper-seal">遠征</span><span>远征手账<small>ENSEI TECHO · LIVE & JOURNEY</small></span></Link>
      <nav className="paper-desktop-nav" aria-label="主导航">{NAV.map(([href, label, index]) => <Link key={href} href={href} prefetch={false} aria-current={(href === "/" ? pathname === href : pathname.startsWith(href)) ? "page" : undefined}><small>{index}</small>{label}</Link>)}</nav>
      <div className="paper-header-tools"><button type="button" data-search-trigger aria-label="搜索" className="paper-search"><Search size={18}/></button><ThemeToggle/><FrontendSwitch/></div>
    </div></header> : <Header/>}
    <main className="flex-1 frontend-content"><LocalStorageBoundary>{children}</LocalStorageBoundary></main>
    {paper ? <footer className="paper-footer"><span>遠征手帳 <small>把想看的现场，写进生活。</small></span><Link href="/sources">官方来源与审核证据</Link><Link href="/me">本机记录与备份 <ArrowUpRight size={13}/></Link></footer> : <Footer/>}
    {paper ? <nav className="paper-bottom-nav" aria-label="移动主导航">{NAV.map(([href,label,index]) => <Link key={href} href={href} prefetch={false} aria-current={(href === "/" ? pathname === href : pathname.startsWith(href)) ? "page" : undefined}><small>{index}</small>{label}</Link>)}</nav> : <BottomTabs/>}
  </>;
}
