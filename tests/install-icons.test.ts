import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(readFileSync("public/manifest.webmanifest", "utf8")) as {
  id?: string;
  start_url: string;
  scope: string;
  icons: { src: string; sizes: string; type: string; purpose?: string }[];
};

function pngSize(path: string): { width: number; height: number } {
  const out = execFileSync("identify", ["-format", "%w %h", path]).toString();
  const [width, height] = out.trim().split(" ").map(Number);
  return { width, height };
}

describe("install icons", () => {
  it("keeps a stable app identity matching start_url and scope", () => {
    expect(manifest.id).toBe("/");
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
  });

  it("declares 192 and 512 any-purpose icons plus a maskable 512", () => {
    const byPurpose = (p: string) => manifest.icons.filter((i) => i.purpose === p);
    expect(
      byPurpose("any")
        .map((i) => i.sizes)
        .sort(),
    ).toEqual(["192x192", "512x512"]);
    expect(byPurpose("maskable").map((i) => i.sizes)).toEqual(["512x512"]);
    for (const icon of manifest.icons) expect(icon.type).toBe("image/png");
  });

  it("every declared icon file exists on disk at exactly the declared pixel size", () => {
    for (const icon of manifest.icons) {
      const path = `public${icon.src}`;
      const { width, height } = pngSize(path);
      const [w, h] = icon.sizes.split("x").map(Number);
      expect({ width, height }, path).toEqual({ width: w, height: h });
    }
  });

  it("icons are fully opaque (no transparent launcher tiles)", () => {
    for (const icon of manifest.icons) {
      const alpha = execFileSync("identify", ["-format", "%A", `public${icon.src}`])
        .toString()
        .trim();
      expect(alpha, icon.src).toBe("Undefined");
    }
  });

  it("a dedicated 180x180 apple-touch-icon exists", () => {
    expect(pngSize("public/icons/apple-touch-icon.png")).toEqual({ width: 180, height: 180 });
  });
});
