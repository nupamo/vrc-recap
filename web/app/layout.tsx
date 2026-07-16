import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const title = "VRChat Recap — 당신의 추억이 게임이 됩니다";
  const description = "스크린샷 폴더를 로컬에서 정리해 개인 통계 recap과 아홉 스테이지의 시간 여행 게임으로 바꿉니다.";

  return {
    title: { default: title, template: "%s · VRChat Recap" },
    description,
    applicationName: "VRChat Recap",
    openGraph: {
      type: "website",
      title,
      description,
      images: [{ url: `${origin}/og.png`, width: 1733, height: 909, alt: "VRChat Recap의 여러 시대를 걷는 픽셀 아트 장면" }],
    },
    twitter: { card: "summary_large_image", title, description, images: [`${origin}/og.png`] },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#17142e",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
