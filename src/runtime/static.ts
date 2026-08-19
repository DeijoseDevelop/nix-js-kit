import { realpath, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

function isInside(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${sep}`);
}

function decodePathname(pathname: string): string | null {
  try {
    const decoded = decodeURIComponent(pathname);
    if (decoded.includes("\0") || decoded.includes("\\") || /%(?:00|2e|2f|5c)/i.test(decoded)) return null;
    if (decoded.split("/").some((segment) => segment === "..")) return null;
    return decoded;
  } catch {
    return null;
  }
}

export async function resolveStaticFile(root: string, pathname: string): Promise<string | null> {
  const decoded = decodePathname(pathname);
  if (decoded === null) return null;

  const resolvedRoot = resolve(root);
  const relativePath = decoded.replace(/^\/+/, "");
  let candidate = resolve(resolvedRoot, relativePath);
  if (!isInside(resolvedRoot, candidate)) return null;

  try {
    const candidateStat = await stat(candidate);
    if (candidateStat.isDirectory()) candidate = resolve(candidate, "index.html");
  } catch {
    if (decoded.endsWith("/") || extname(decoded) === "") candidate = resolve(candidate, "index.html");
  }

  if (!isInside(resolvedRoot, candidate)) return null;

  try {
    const [canonicalRoot, canonicalCandidate, candidateStat] = await Promise.all([
      realpath(resolvedRoot),
      realpath(candidate),
      stat(candidate),
    ]);
    if (!candidateStat.isFile() || !isInside(canonicalRoot, canonicalCandidate)) return null;
    return canonicalCandidate;
  } catch {
    return null;
  }
}
