"use client";
import { PanelsTopLeft } from "lucide-react";
import { setFrontend, useFrontend } from "./frontend-store";

export default function FrontendSwitch() {
  const mode = useFrontend();
  return <button type="button" className="frontend-switch" data-testid="frontend-switch" aria-label={mode === "paper" ? "切换到经典版" : "切换到纸感手账"} title="保留当前页面与已保存记录，切换界面" onClick={() => {
    setFrontend(mode === "paper" ? "classic" : "paper");
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('[data-testid="frontend-switch"]')?.focus({ preventScroll: true }));
  }}>
    <PanelsTopLeft size={15} aria-hidden="true" /><span>{mode === "paper" ? "经典版" : "纸感手账"}</span><span aria-hidden="true">⇄</span>
  </button>;
}
