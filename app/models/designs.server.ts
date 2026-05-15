import { readFileSync } from "fs";
import { join } from "path";
import { getDataDir } from "~/lib/storage.server";

export interface DesignRecord {
  token: string;
  productId?: string;
  designJson?: unknown;
  frontPreviewUrl?: string;
  backPreviewUrl?: string;
  frontPrintUrl?: string;
  backPrintUrl?: string;
  createdAt: string;
}

export interface DesignObject {
  type: string;
  src?: string;
  text?: string;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  scaleX?: number;
  scaleY?: number;
  angle?: number;
}

export function getDesignByToken(token: string): DesignRecord | null {
  try {
    const raw = readFileSync(join(getDataDir(), "designs.json"), "utf8");
    const records = JSON.parse(raw) as DesignRecord[];
    return records.find((r) => r.token === token) ?? null;
  } catch {
    return null;
  }
}

export function extractObjects(designJson: unknown, side: "front" | "back"): DesignObject[] {
  try {
    const json = designJson as Record<string, unknown>;
    const canvas = json[side] as { objects?: DesignObject[] } | undefined;
    return canvas?.objects?.filter((o) => o.type !== "rect") ?? [];
  } catch {
    return [];
  }
}
