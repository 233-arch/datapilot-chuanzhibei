import { useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import type { ContextAction } from "@/lib/context-actions";
export function ContextAssistant({ page, scope, actions, disabled, onAction }: { page: string; scope: string; actions: ContextAction[]; disabled: boolean; onAction: (action: ContextAction) => void }) {
  const [pending, setPending] = useState<ContextAction | null>(null);
  return <section className="context-assistant" aria-label="当前页面助手"><span className="product-eyebrow"><Sparkles size={15} />正在协助 · {page}</span><p>{scope}</p><div className="context-action-list">{actions.map(action => <button disabled={disabled} key={action.id} onClick={() => action.id === "add-report" ? setPending(action) : onAction(action)}><span>{action.label}<small>{action.description}</small></span><ArrowRight size={16} /></button>)}</div>{pending && <div className="context-confirm"><strong>加入当前图表</strong><p>保留图表的指标与筛选条件，并选入报告草稿。数据不会改变。</p><div className="product-actions"><button className="button primary" disabled={disabled} onClick={() => { onAction(pending); setPending(null); }}>确认加入</button><button className="button subtle" onClick={() => setPending(null)}>取消</button></div></div>}</section>;
}
