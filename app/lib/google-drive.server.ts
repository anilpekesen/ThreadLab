// Google Drive integration for admin order exports.
// Uses OAuth 2.0 with the `drive.file` scope so we only touch files this app
// created — no broad Drive access, no Google verification needed for that
// scope.

import {
  getDriveConnection,
  updateDriveAccessToken,
  updateRootFolderId,
} from "~/models/shop-google-drive.server";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const USERINFO_SCOPE = "https://www.googleapis.com/auth/userinfo.email";
const ROOT_FOLDER_NAME = "PrintLab Tasarımları";

function env(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env var: ${key}`);
  return v;
}

export function buildAuthUrl(state: string): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", env("GOOGLE_CLIENT_ID"));
  url.searchParams.set("redirect_uri", env("GOOGLE_REDIRECT_URI"));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", `${DRIVE_SCOPE} ${USERINFO_SCOPE}`);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent"); // force refresh_token even on re-auth
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);
  return url.toString();
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

export async function exchangeCodeForToken(code: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    code,
    client_id: env("GOOGLE_CLIENT_ID"),
    client_secret: env("GOOGLE_CLIENT_SECRET"),
    redirect_uri: env("GOOGLE_REDIRECT_URI"),
    grant_type: "authorization_code",
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token exchange failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<TokenResponse>;
}

export async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: Date }> {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: env("GOOGLE_CLIENT_ID"),
    client_secret: env("GOOGLE_CLIENT_SECRET"),
    grant_type: "refresh_token",
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google refresh failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as TokenResponse;
  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  };
}

export async function getUserEmail(accessToken: string): Promise<string> {
  const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`userinfo failed: ${res.status}`);
  const data = (await res.json()) as { email?: string };
  return data.email ?? "";
}

export async function getValidAccessToken(shop: string): Promise<string> {
  const conn = await getDriveConnection(shop);
  if (!conn) throw new Error("Google Drive not connected for this shop.");

  const expiresSoon = !conn.accessTokenExpiresAt
    || conn.accessTokenExpiresAt.getTime() - Date.now() < 60_000;
  if (conn.accessToken && !expiresSoon) return conn.accessToken;

  const refreshed = await refreshAccessToken(conn.refreshToken);
  await updateDriveAccessToken(shop, refreshed.accessToken, refreshed.expiresAt);
  return refreshed.accessToken;
}

async function driveJson<T>(
  accessToken: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`https://www.googleapis.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
}

async function createFolder(
  accessToken: string,
  name: string,
  parentId?: string,
): Promise<string> {
  const body = {
    name,
    mimeType: "application/vnd.google-apps.folder",
    ...(parentId ? { parents: [parentId] } : {}),
  };
  const data = await driveJson<DriveFile>(accessToken, "/drive/v3/files?fields=id", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return data.id;
}

function driveQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function findSubfolder(
  accessToken: string,
  parentId: string,
  name: string,
): Promise<string | null> {
  const q = [
    `'${driveQueryValue(parentId)}' in parents`,
    `name = '${driveQueryValue(name)}'`,
    `mimeType = 'application/vnd.google-apps.folder'`,
    `trashed = false`,
  ].join(" and ");

  try {
    const data = await driveJson<{ files?: DriveFile[] }>(
      accessToken,
      `/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1`,
    );
    return data.files?.[0]?.id ?? null;
  } catch (err) {
    // Some accounts reject listing with drive.file; uploading still works.
    console.warn("[google-drive] folder lookup skipped", err);
    return null;
  }
}

function isGeneratedOrderFileName(name: string): boolean {
  return /^(\d+-)?(front|back)-(print(-\d+)?|mockup)\.png$/i.test(name)
    || /^(\d+-)?design\.json$/i.test(name)
    || /^(siparis|order|quality-report)\.(txt|json)$/i.test(name);
}

async function listFolderFiles(accessToken: string, folderId: string): Promise<DriveFile[]> {
  const q = [
    `'${driveQueryValue(folderId)}' in parents`,
    "trashed = false",
  ].join(" and ");
  const files: DriveFile[] = [];
  let pageToken = "";

  do {
    const page = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "";
    const data = await driveJson<{ files?: DriveFile[]; nextPageToken?: string }>(
      accessToken,
      `/drive/v3/files?q=${encodeURIComponent(q)}&fields=nextPageToken,files(id,name,mimeType)&pageSize=100${page}`,
    );
    files.push(...(data.files ?? []));
    pageToken = data.nextPageToken ?? "";
  } while (pageToken);

  return files;
}

async function deleteDriveFile(accessToken: string, fileId: string): Promise<void> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`Drive delete ${res.status}: ${text}`);
  }
}

export async function clearGeneratedOrderFiles(
  accessToken: string,
  folderId: string,
): Promise<number> {
  try {
    const files = await listFolderFiles(accessToken, folderId);
    const deletable = files.filter((file) =>
      file.mimeType !== "application/vnd.google-apps.folder" && isGeneratedOrderFileName(file.name),
    );
    await Promise.all(deletable.map((file) => deleteDriveFile(accessToken, file.id)));
    return deletable.length;
  } catch (err) {
    // With drive.file some accounts can upload but cannot list existing files.
    // In that case we skip cleanup instead of blocking production exports.
    console.warn("[google-drive] generated file cleanup skipped", err);
    return 0;
  }
}

export async function ensureRootFolder(shop: string, accessToken: string): Promise<string> {
  const conn = await getDriveConnection(shop);
  if (conn?.rootFolderId) return conn.rootFolderId;

  // `drive.file` is intentionally narrow and some Google accounts reject
  // DriveFiles.List with 403 even though create/upload calls are allowed.
  // Create the root folder directly and persist the returned id.
  const id = await createFolder(accessToken, ROOT_FOLDER_NAME);
  await updateRootFolderId(shop, id);
  return id;
}

export async function ensureSubfolder(
  accessToken: string,
  parentId: string,
  name: string,
): Promise<string> {
  const existingId = await findSubfolder(accessToken, parentId, name);
  if (existingId) return existingId;
  return createFolder(accessToken, name, parentId);
}

export async function uploadBytes(
  accessToken: string,
  folderId: string,
  name: string,
  mimeType: string,
  bytes: Uint8Array,
): Promise<DriveFile> {
  // Multipart upload: metadata + binary in one request.
  const boundary = "boundary-" + Math.random().toString(36).slice(2);
  const metadata = JSON.stringify({ name, parents: [folderId] });

  const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`;
  const tail = `\r\n--${boundary}--`;

  const headBytes = new TextEncoder().encode(head);
  const tailBytes = new TextEncoder().encode(tail);
  const body = new Uint8Array(headBytes.length + bytes.length + tailBytes.length);
  body.set(headBytes, 0);
  body.set(bytes, headBytes.length);
  body.set(tailBytes, headBytes.length + bytes.length);

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive upload ${res.status}: ${text}`);
  }
  return res.json() as Promise<DriveFile>;
}

export async function uploadFromUrl(
  accessToken: string,
  folderId: string,
  name: string,
  url: string,
  fallbackMime = "application/octet-stream",
): Promise<DriveFile> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Source fetch failed (${res.status}): ${url}`);
  const mime = res.headers.get("content-type")?.split(";")[0]?.trim() || fallbackMime;
  const buf = new Uint8Array(await res.arrayBuffer());
  return uploadBytes(accessToken, folderId, name, mime, buf);
}

export async function uploadText(
  accessToken: string,
  folderId: string,
  name: string,
  text: string,
  mimeType = "text/plain; charset=utf-8",
): Promise<DriveFile> {
  return uploadBytes(accessToken, folderId, name, mimeType, new TextEncoder().encode(text));
}

export async function getFolderWebUrl(folderId: string): Promise<string> {
  return `https://drive.google.com/drive/folders/${folderId}`;
}

export async function getDriveFolderName(accessToken: string, folderId: string): Promise<string | null> {
  try {
    const data = await driveJson<{ name?: string }>(accessToken, `/drive/v3/files/${folderId}?fields=name`);
    return data.name ?? null;
  } catch {
    return null;
  }
}

export async function renameDriveFolder(accessToken: string, folderId: string, newName: string): Promise<void> {
  await driveJson<DriveFile>(accessToken, `/drive/v3/files/${folderId}?fields=id`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: newName }),
  });
}
