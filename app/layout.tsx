import type { Metadata } from "next";
import "./globals.css";
import "./exploration.css";
import "./delivery.css";
import "./copilot.css";

export const metadata: Metadata = {
  title: "数问 DataPilot · 让数据回答问题",
  description:
    "用自然语言探索数据，从一份表格到一个可靠的决策。支持 CSV 数据分析、质量检查、交互图表与报告导出。",
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
