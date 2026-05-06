import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { handleDesignerUpload } from "~/models/uploads.server";
import { authenticate } from "~/shopify.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  await authenticate.public.appProxy(request);
  return json({ ok: true, path: params["*"] ?? "" });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  await authenticate.public.appProxy(request);
  const path = params["*"] ?? "";
  if (path === "upload") {
    return handleDesignerUpload(request);
  }
  return json({ error: "Not found" }, { status: 404 });
};
