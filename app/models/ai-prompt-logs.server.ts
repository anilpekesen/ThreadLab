import { query } from "~/lib/db.server";
import { randomBytes } from "node:crypto";

export interface AiPromptLog {
  id: string;
  shop: string;
  userPrompt: string;
  finalPrompt: string;
  resultUrl: string;
  success: boolean;
  errorMsg: string | null;
  createdAt: string;
}

export async function logAiPrompt(data: {
  shop: string;
  userPrompt: string;
  finalPrompt: string;
  resultUrl?: string;
  success: boolean;
  errorMsg?: string;
}): Promise<void> {
  const id = `apl_${randomBytes(8).toString("hex")}`;
  await query(
    `INSERT INTO ai_prompt_logs (id, shop, user_prompt, final_prompt, result_url, success, error_msg)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, data.shop, data.userPrompt, data.finalPrompt, data.resultUrl ?? "", data.success, data.errorMsg ?? null],
  );
}

export async function getAiPromptLogs(opts: {
  shop?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<AiPromptLog[]> {
  const { shop, limit = 100, offset = 0 } = opts;
  const result = await query<{
    id: string;
    shop: string;
    user_prompt: string;
    final_prompt: string;
    result_url: string;
    success: boolean;
    error_msg: string | null;
    created_at: Date;
  }>(
    shop
      ? `SELECT * FROM ai_prompt_logs WHERE shop = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`
      : `SELECT * FROM ai_prompt_logs ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
    shop ? [shop, limit, offset] : [limit, offset],
  );
  return result.rows.map((r) => ({
    id: r.id,
    shop: r.shop,
    userPrompt: r.user_prompt,
    finalPrompt: r.final_prompt,
    resultUrl: r.result_url,
    success: r.success,
    errorMsg: r.error_msg,
    createdAt: r.created_at.toISOString(),
  }));
}

export async function getAiPromptLogsCount(shop?: string): Promise<number> {
  const result = await query<{ count: string }>(
    shop
      ? `SELECT COUNT(*)::text as count FROM ai_prompt_logs WHERE shop = $1`
      : `SELECT COUNT(*)::text as count FROM ai_prompt_logs`,
    shop ? [shop] : [],
  );
  return parseInt(result.rows[0]?.count ?? "0", 10);
}
