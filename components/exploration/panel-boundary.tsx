"use client";
import { Component, type ReactNode } from "react";
import { AlertTriangle, ArrowLeft, RotateCcw } from "lucide-react";

/** Keep the shared workspace and navigation alive if a page module fails to render. */
export class PanelBoundary extends Component<{ children: ReactNode; onHome: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <section className="workspace-panel-error" role="alert" aria-labelledby="panel-error-title">
      <span><AlertTriangle size={27} /></span><h2 id="panel-error-title">这个页面暂时无法显示</h2>
      <p>可以重新加载此页面模块，或返回工作台继续使用其他功能。当前数据和分析设置仍保留在工作空间中。</p>
      <div><button className="button primary" onClick={() => this.setState({ failed: false })}><RotateCcw size={16} />重试此页面</button><button className="button subtle" onClick={this.props.onHome}><ArrowLeft size={16} />返回工作台</button></div>
    </section>;
  }
}
