import type { Metadata, Viewport } from "next";
import "./globals.css";

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://nupamo.github.io/vrc-recap")
  .replace(/\/$/, "");
const title = "VRC Recap — 사진 속에 남은 우리의 시간";
const description = "VRChat 스크린샷 속 월드와 사람, 오래 이어진 인연을 원본 사진으로 다시 만나는 개인 Recap.";
const socialImage = `${siteUrl}/og-memory-recap.png`;

export const metadata: Metadata = {
  applicationName: "VRC Recap",
  description,
  metadataBase: new URL(`${siteUrl}/`),
  openGraph: {
    description,
    images: [{
      alt: "VRChat 사진이 펼쳐진 감성적인 추억 앨범",
      height: 909,
      url: socialImage,
      width: 1730,
    }],
    title,
    type: "website",
  },
  title,
  twitter: {
    card: "summary_large_image",
    description,
    images: [socialImage],
    title,
  },
};

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
