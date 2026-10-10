import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "排练室预约",
  description: "查看每日排练室时段，预约或使用取消码取消预约。",
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
