import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

function ensureDir(dir: string) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getStorageRoot() {
  const configuredRoot =
    process.env.APP_STORAGE_DIR ||
    process.env.RAILWAY_VOLUME_MOUNT_PATH ||
    "";

  return configuredRoot ? ensureDir(configuredRoot) : process.cwd();
}

export function getDataDir() {
  const configuredRoot =
    process.env.APP_STORAGE_DIR ||
    process.env.RAILWAY_VOLUME_MOUNT_PATH;

  if (configuredRoot) {
    return ensureDir(path.join(getStorageRoot(), "data"));
  }

  return ensureDir(path.join(process.cwd(), "data"));
}

export function getUploadsDir() {
  const configuredRoot =
    process.env.APP_STORAGE_DIR ||
    process.env.RAILWAY_VOLUME_MOUNT_PATH;

  if (configuredRoot) {
    return ensureDir(path.join(getStorageRoot(), "uploads"));
  }

  return ensureDir(path.join(process.cwd(), "public", "uploads"));
}
