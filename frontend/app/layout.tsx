import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VXLAN Machine Manager",
  description: "VXLANネットワーク内のマシンを自動登録・監視し、接続状態をリアルタイムで管理するシステム",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
