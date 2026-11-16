import type { Metadata } from "next";
import "./globals.css";
import "./exploration.css";
import "./delivery.css";
import "./copilot.css";
import "./diagnostics.css";
import "./intelligence.css";
import "./readability.css";
import "./charts.css";
import "./diagnostic-charts.css";
import "./workspace-polish.css";
import "./data-preview.css";
import "./quality-audit.css";
import "./page-navigation.css";
import "./business-rules.css";
import "./report-center.css";
import "./dataset-library.css";
import "./product-workflows.css";
import "./product-theme.css";
import "./product-patterns.css";

export const metadata: Metadata = {
  title: "数问 DataPilot · 让数据回答问题",
  description:
    "用自然语言探索数据，从一份表格到一个可靠的决策。支持 Excel / CSV 数据分析、质量检查、交互图表与报告导出。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
