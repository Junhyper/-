import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "20年統計 AI天気予報",
  description:
    "過去20年分の気象データ（Open-Meteo）から、その時期の統計的な傾向を算出し、生成AIが分かりやすい天気予報の解説文を作成します。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
