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
    expect(pngSize("public/icons/apple-touch-icon-v3.png")).toEqual({ width: 180, height: 180 });
  });

  it("keeps the enlarged glyph within 72–80% of any-purpose tiles", () => {
    const bounds = foregroundStats("public/icons/icon-512-v3.png");
    expect(bounds.width / 512).toBeGreaterThanOrEqual(0.72);
    expect(bounds.width / 512).toBeLessThanOrEqual(0.8);
    expect(bounds.height / 512).toBeGreaterThanOrEqual(0.72);
    expect(bounds.height / 512).toBeLessThanOrEqual(0.8);
  });

  it("keeps every essential maskable foreground pixel inside the central 80%-diameter circle", () => {
    const bounds = foregroundStats("public/icons/icon-maskable-512-v3.png");
    expect(bounds.maxRadius).toBeLessThanOrEqual(512 * 0.4);
    expect(bounds.width).toBeGreaterThan(280);
  });

  it("provides exact 32px and 48px favicons", () => {
    for (const size of [32, 48]) {
      expect(pngSize(`public/icons/favicon-${size}-v3.png`)).toEqual({ width: size, height: size });
    }
  });
});

function foregroundStats(path: string): { width: number; height: number; maxRadius: number } {
  return JSON.parse(
    execFileSync("python", [
      "-c",
      `import json,sys,math
from PIL import Image
im=Image.open(sys.argv[1]).convert('RGB')
points=[(x,y) for y in range(im.height) for x in range(im.width) if min(im.getpixel((x,y)))>200]
xs,ys=zip(*points)
print(json.dumps({'width':max(xs)-min(xs)+1,'height':max(ys)-min(ys)+1,'maxRadius':max(math.hypot(x+0.5-im.width/2,y+0.5-im.height/2) for x,y in points)}))`,
      path,
    ]).toString(),
  );
}
