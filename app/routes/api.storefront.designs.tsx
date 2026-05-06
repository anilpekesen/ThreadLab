import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type DesignRecord = {
  token: string;
  productId?: string;
  designJson?: unknown;
  previewUrl?: string;
  createdAt: string;
};

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "designs.json");

async function readDesigns(): Promise<DesignRecord[]> {
  try {
    return JSON.parse(await readFile(DATA_FILE, "utf8")) as DesignRecord[];
  } catch {
    return [];
  }
}

async function writeDesigns(records: DesignRecord[]) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(DATA_FILE, JSON.stringify(records, null, 2));
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  return json({ ok: true, method: request.method });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const token = `d_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
  const record: DesignRecord = {
    token,
    productId: typeof body.productId === "string" ? body.productId : undefined,
    designJson: "designJson" in body ? body.designJson : undefined,
    previewUrl: typeof body.previewUrl === "string" ? body.previewUrl : undefined,
    createdAt: new Date().toISOString(),
  };

  const records = await readDesigns();
  records.unshift(record);
  await writeDesigns(records.slice(0, 500));

  return json({ token });
};
