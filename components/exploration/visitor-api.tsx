"use client";
import { useEffect, useState } from "react";
import { LoaderCircle, ShieldCheck, Trash2 } from "lucide-react";
import { MODEL_PROVIDERS, type VisitorModel } from "@/lib/visitor-credentials";
import { openApiSettings, setVisitorModel, useVisitorModel } from "@/lib/visitor-model";
import { createVisitorConnection } from "@/lib/visitor-connection";

export function ApiAccessNotice() {
  const config = useVisitorModel();
  return !config ? <div className="visitor-api-notice">
    <span>AI 功能需自行接入 API。图表、筛选和本机计算可直接体验。</span>
    <button className="text-button" onClick={openApiSettings}>配置我的 API</button>
  </div> : null;
}

export function VisitorApiSettings() {
  const current = useVisitorModel();
  const [provider, setProvider] = useState<VisitorModel["provider"]>(current?.provider || "deepseek");
  const [key, setKey] = useState(current?.key || "");
  const [model, setModel] = useState(current?.model || MODEL_PROVIDERS.deepseek.defaultModel);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [ok, setOk] = useState(false);
  const [connection] = useState(() => createVisitorConnection(setVisitorModel));
  useEffect(() => () => connection.cancel(), [connection]);
  function invalidate() { connection.cancel(); setBusy(false); setMessage(""); setOk(false); }
  async function connect() {
    invalidate();
    setBusy(true);
    setMessage("正在使用 2 行合成样本验证工具调用…");
    const result = await connection.connect({ provider, key, model });
    if (!result) return;
    setOk(result.ok); setBusy(false);
    setMessage(result.ok ? result.message : `${result.message} 本次配置未应用。`);
  }
  return <div className="visitor-api-settings">
    <p>使用你自己的 API 账户，费用由对应服务商收取。密钥经本站 HTTPS 服务临时转发给所选服务商；本站不主动保存或记录密钥。</p>
    <div className="visitor-api-fields">
      <label>API 服务商<select value={provider} onChange={e => {
        invalidate(); const id = e.target.value as VisitorModel["provider"]; setProvider(id); setModel(MODEL_PROVIDERS[id].defaultModel); setKey("");
      }}>{Object.entries(MODEL_PROVIDERS).map(([id, p]) => <option key={id} value={id}>{p.label}</option>)}</select></label>
      <label>模型 ID<input value={model} maxLength={100} autoComplete="off" placeholder="填写账户可用且支持工具调用的模型 ID" onChange={e => { invalidate(); setModel(e.target.value); }} /></label>
      <label className="visitor-api-key">我的 API Key<input type="password" value={key} maxLength={4096} autoComplete="off" spellCheck={false} placeholder="输入你自己的 API Key" onChange={e => { invalidate(); setKey(e.target.value); }} /></label>
    </div>
    <small>服务地址：{MODEL_PROVIDERS[provider].url}。仅支持上述官方服务，模型须支持 Chat Completions 工具调用。</small>
    <div className="visitor-api-actions">
      <button className="button primary" disabled={busy || !key.trim() || !model.trim()} onClick={() => void connect()}>{busy ? <LoaderCircle size={14} className="spin" /> : <ShieldCheck size={14} />}验证并应用我的 API</button>
      <button className="button subtle" disabled={!current && !key} onClick={() => { invalidate(); setVisitorModel(null); setKey(""); setMessage("已清除 API 配置，当前为本地演示模式。"); }}><Trash2 size={14} />清除 API 配置</button>
    </div>
    <p className="diagnostic-note">当前生效：{current ? `${MODEL_PROVIDERS[current.provider].label} · ${current.model}（已验证）` : "本地演示模式"}。验证失败会保留原配置。</p>
    <p className="diagnostic-note">配置仅在当前页面内存中生效，刷新或关闭页面即清除，不随数据集、报告或配置导出。连接验证会消耗少量个人 API 额度；不发送当前数据表。</p>
    {message && <p role="status" className={ok ? "model-health-result" : "model-health-result failed"}>{message}</p>}
  </div>;
}
