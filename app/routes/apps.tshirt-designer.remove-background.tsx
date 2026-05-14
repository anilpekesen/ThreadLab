import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { handlePhotoroomRemoveBackground } from "~/models/background-removal.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  return json({ error: `Method ${request.method} not allowed` }, { status: 405 });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  return handlePhotoroomRemoveBackground(request);
};
