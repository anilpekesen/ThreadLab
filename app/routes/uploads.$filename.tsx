import type { LoaderFunctionArgs } from "@remix-run/node";
import { serveUploadedFile } from "~/models/uploads.server";

export const loader = async ({ params }: LoaderFunctionArgs) => {
  return serveUploadedFile(params.filename ?? "");
};
