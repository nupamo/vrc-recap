import type { NextConfig } from "next";

const repositoryName = process.env.GITHUB_REPOSITORY?.split("/").at(-1) ?? "vrc-recap";
const isGitHubPagesBuild = process.env.GITHUB_PAGES === "true";
const isUserSite = repositoryName.endsWith(".github.io");
const publicBasePath = isGitHubPagesBuild && !isUserSite ? `/${repositoryName}` : "";
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  ?? (isGitHubPagesBuild
    ? `https://nupa.moe${publicBasePath}`
    : "http://localhost:3000");

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BASE_PATH: publicBasePath,
    NEXT_PUBLIC_SITE_URL: siteUrl,
  },
  images: {
    unoptimized: true,
  },
  output: "export",
  trailingSlash: true,
};

export default nextConfig;
