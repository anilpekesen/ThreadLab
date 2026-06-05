import type { LoaderFunctionArgs } from "@remix-run/node";
import { getPost } from "~/lib/blog-content.server";
import { renderBlogPost } from "~/lib/blog-render.server";

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const post = getPost("en", params.slug ?? "");
  if (!post) {
    throw new Response("Not Found", { status: 404 });
  }

  return new Response(renderBlogPost(post), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=1800",
    },
  });
};
