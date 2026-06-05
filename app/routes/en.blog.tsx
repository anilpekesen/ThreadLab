import type { LoaderFunctionArgs } from "@remix-run/node";
import { renderBlogIndex } from "~/lib/blog-render.server";

export const loader = async (_args: LoaderFunctionArgs) => {
  return new Response(renderBlogIndex("en"), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=1800",
    },
  });
};
