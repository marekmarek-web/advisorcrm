import type { MetadataRoute } from "next";

function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    "https://aidvisora.cz"
  );
}

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/"],
        disallow: [
          "/api/",
          "/portal/",
          "/client/",
          "/auth/",
          "/dashboard/",
          "/onboarding/",
          "/monitoring/",
        ],
      },
      // AI crawlers — blokovat scraping citlivých sekcí. Produktové landing stránky
      // je ok indexovat (marketing), ale ne klientskou zónu.
      {
        userAgent: "GPTBot",
        allow: ["/", "/pricing", "/terms", "/privacy", "/cookies", "/bezpecnost"],
        disallow: ["/portal/", "/client/", "/api/"],
      },
      {
        userAgent: "ClaudeBot",
        allow: ["/", "/pricing", "/terms", "/privacy", "/cookies", "/bezpecnost"],
        disallow: ["/portal/", "/client/", "/api/"],
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
    host: siteUrl(),
  };
}
