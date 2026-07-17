import type { Metadata, Viewport } from "next";
import "./globals.css";

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://nupa.moe/vrc-recap")
  .replace(/\/$/, "");
const title = "VRC Recap — Your VRChat Memories, Revisited";
const description = "Turn your VRChat screenshots into a personal recap of the worlds you visited, the people you met, and the memories you kept. Your photos stay in your browser.";
const socialImage = `${siteUrl}/og.png`;
const brandIcon = `${siteUrl}/vrc-recap-mark.png`;
const googleAnalyticsId = "G-SYEWNRRSVM";

export const metadata: Metadata = {
  alternates: {
    canonical: siteUrl,
  },
  applicationName: "VRC Recap",
  authors: [{ name: "nupamo", url: "https://x.com/nupamo" }],
  creator: "nupamo",
  description,
  icons: {
    apple: brandIcon,
    icon: brandIcon,
    shortcut: brandIcon,
  },
  metadataBase: new URL(`${siteUrl}/`),
  openGraph: {
    description,
    images: [{
      alt: "VRC Recap — Your VRChat Memories, Revisited",
      height: 1204,
      url: socialImage,
      width: 2108,
    }],
    locale: "en_US",
    siteName: "VRC Recap",
    title,
    type: "website",
    url: siteUrl,
  },
  keywords: [
    "VRChat",
    "VRC Recap",
    "VRChat screenshots",
    "VRChat memories",
    "VRChat photos",
  ],
  publisher: "nupamo",
  robots: {
    follow: true,
    index: true,
  },
  title,
  twitter: {
    card: "summary_large_image",
    creator: "@nupamo",
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
    <html lang="en">
      <head>
        <script
          async
          src={`https://www.googletagmanager.com/gtag/js?id=${googleAnalyticsId}`}
        ></script>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${googleAnalyticsId}');
            `,
          }}
        ></script>
      </head>
      <body>{children}</body>
    </html>
  );
}
