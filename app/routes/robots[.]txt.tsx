import type { LoaderFunctionArgs } from "@remix-run/node";

const SITE_ORIGIN = "https://printlabapp.com";

export const loader = async (_args: LoaderFunctionArgs) => {
  const body = [
    "User-agent: *",
    "Allow: /",
    "",
    `Sitemap: ${SITE_ORIGIN}/sitemap.xml`,
  ].join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
