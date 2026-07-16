import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host")
    ?? requestHeaders.get("host")
    ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto")
    ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const title = "VRChat Recap — 사진 속에 남은 우리의 시간";
  const description = "VRChat 스크린샷 속 월드와 사람, 오래 이어진 인연을 원본 사진으로 다시 만나는 개인 Recap.";

  return {
    applicationName: "VRChat Recap",
    description,
    metadataBase: new URL(origin),
    openGraph: {
      description,
      images: [{
        alt: "VRChat 사진이 펼쳐진 감성적인 추억 앨범",
        height: 909,
        url: "/og-memory-recap.png",
        width: 1730,
      }],
      title,
      type: "website",
    },
    title,
    twitter: {
      card: "summary_large_image",
      description,
      images: ["/og-memory-recap.png"],
      title,
    },
  };
}

export const viewport: Viewport = {
  initialScale: 1,
  themeColor: "#171715",
  width: "device-width",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
