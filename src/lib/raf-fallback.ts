// 隐藏页面(后台标签/未显示的预览面板)中浏览器会暂停 requestAnimationFrame,
// 影响两类代码:
//  1. React 流式 Suspense 的边界揭示($RT/$RV 由 rAF 驱动,如 /events 列表);
//  2. maplibre / three.js 的初始化与渲染循环(模块作用域捕获 rAF 引用)。
// 因此该补丁以内联 <script> 形式注入 layout <head>,先于 React 内联脚本与
// 一切模块执行:document.hidden 时 rAF 退化为 setTimeout(约 30fps),可见时走原生。
// ResizeObserver 的回调同样挂在渲染管线上,隐藏页面永不派发,导致 r3f Canvas
// (react-use-measure)一直测得 0 尺寸而不挂载场景,故一并在隐藏时合成派发。

export const RAF_FALLBACK_SNIPPET = `(function(){try{
if(window.__enseiRafPatched)return;window.__enseiRafPatched=true;
var nraf=window.requestAnimationFrame.bind(window),ncaf=window.cancelAnimationFrame.bind(window);
var seq=0,reg=new Map();
window.requestAnimationFrame=function(cb){var id=++seq;
if(document.hidden){reg.set(id,{t:1,h:setTimeout(function(){reg.delete(id);cb(performance.now())},33)})}
else{reg.set(id,{t:0,h:nraf(function(ts){reg.delete(id);cb(ts)})})}
return id};
window.cancelAnimationFrame=function(id){var e=reg.get(id);if(!e){ncaf(id);return}reg.delete(id);if(e.t)clearTimeout(e.h);else ncaf(e.h)};
var NRO=window.ResizeObserver;
if(NRO){window.ResizeObserver=class extends NRO{
constructor(cb){super(cb);this._cb=cb;this._els=new Set()}
observe(el,opts){super.observe(el,opts);this._els.add(el);if(document.hidden){var s=this;setTimeout(function(){s._deliver()},30);setTimeout(function(){s._deliver()},300)}}
unobserve(el){super.unobserve(el);this._els.delete(el)}
disconnect(){super.disconnect();this._els.clear()}
_deliver(){if(!document.hidden||this._els.size===0)return;var es=[];this._els.forEach(function(el){var r=el.getBoundingClientRect();var b=[{inlineSize:r.width,blockSize:r.height}];es.push({target:el,contentRect:r,borderBoxSize:b,contentBoxSize:b,devicePixelContentBoxSize:b})});this._cb(es,this)}
}}
}catch(e){}})()`;
