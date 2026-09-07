"use client";
import { Component, type ReactNode } from "react";

/** Keep the switch and navigation usable when browser policy blocks legacy stores. */
export default class LocalStorageBoundary extends Component<{children:ReactNode},{blocked:boolean}> {
  state = { blocked:false };
  static getDerivedStateFromError(error: Error) {
    if (error.name === "SecurityError" || error.name === "QuotaExceededError") return { blocked:true };
    throw error;
  }
  render() {
    if (!this.state.blocked) return this.props.children;
    return <section role="alert" className="mx-auto my-12 max-w-xl rounded-xl border border-amber-300 bg-amber-50 p-6 text-amber-950">
      <h1 className="text-xl font-semibold">浏览器存储暂不可用</h1>
      <p className="my-3 text-sm leading-7">当前无法载入或保存本地手账记录。请允许此站点使用本地存储，或备份后释放存储空间，再刷新页面。两套界面仍可通过顶部按钮切换。</p>
      <button type="button" onClick={()=>window.location.reload()} className="min-h-11 rounded border border-amber-700 px-4 text-sm">重新载入</button>
    </section>;
  }
}
