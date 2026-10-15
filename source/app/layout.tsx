import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "麦麦联名馆 | 联名活动与门店查询",
  description: "连接麦当劳，发现当前联名活动、核对附近门店菜单，一键打开地图找店。支持手机、平板与电脑。",
  referrer: "strict-origin-when-cross-origin",
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
