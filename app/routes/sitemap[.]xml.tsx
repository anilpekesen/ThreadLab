import type { LoaderFunctionArgs } from "@remix-run/node";
import { blogPostPath, blogPosts } from "~/lib/blog-content.server";

const SITE_ORIGIN = "https://printlabapp.com";

export const loader = async (_args: LoaderFunctionArgs) => {
  const pages = [
    { path: "/home", changefreq: "weekly", priority: "1.0" },
    { path: "/blog", changefreq: "weekly", priority: "0.8" },
    { path: "/en/blog", changefreq: "weekly", priority: "0.8" },
    ...blogPosts.map((post) => ({
      path: blogPostPath(post),
      changefreq: "monthly",
      priority: "0.7",
    })),
    { path: "/privacy-policy", changefreq: "monthly", priority: "0.4" },
    { path: "/terms-of-service", changefreq: "monthly", priority: "0.4" },
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map((page) => `  <url>
    <loc>${SITE_ORIGIN}${page.path}</loc>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`).join("\n")}
</urlset>`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
