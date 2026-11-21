import { buildPageMetadata, getSiteUrl, SITE_DESCRIPTION, SITE_NAME } from "@/lib/seo";

export const defaultMetadata = {
  ...buildPageMetadata({
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  }),
  metadataBase: new URL(getSiteUrl()),
  alternates: { canonical: getSiteUrl() },
  title: {
    default: `${SITE_NAME} | Fresh Homemade Food in Bahawalpur`,
    template: `%s | ${SITE_NAME}`,
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: SITE_NAME,
    statusBarStyle: "default" as const,
  },
  icons: {
    icon: [
      { url: "/icons/app-icon.svg", type: "image/svg+xml" },
      { url: "/icons/app-icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/app-icon-192.png", sizes: "192x192", type: "image/png" }],
  },
};
