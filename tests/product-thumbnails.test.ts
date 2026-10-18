import { beforeEach, describe, expect, it, vi } from "vitest";

import { createProductThumbnails, readProductPhotos } from "@/hooks/use-product-thumbnails";
import { db, type LocalProductPhoto } from "@/lib/local-db";
import { OTHER, resetDb, STORE } from "./helpers";

function photo(productId: string, storeId = STORE): LocalProductPhoto {
  const blob = new Blob([productId], { type: "image/png" });
  return {
    id: crypto.randomUUID(),
    store_id: storeId,
    product_id: productId,
    blob,
    content_type: blob.type,
    size: blob.size,
    created_at: new Date().toISOString(),
  };
}

beforeEach(resetDb);

describe("POS product thumbnails", () => {
  it("reads configured device photos only for the current store without changing records", async () => {
    await db().product_photos.bulkPut([photo("soda"), photo("other-store", OTHER)]);
    const rows = await readProductPhotos(STORE);
    expect(rows.map((row) => row.product_id)).toEqual(["soda"]);
    expect(await readProductPhotos("")).toEqual([]);
    expect(await db().product_photos.count()).toBe(2);
  });

  it("maps each product to its saved blob and releases all display URLs", () => {
    const rows = [photo("soda"), photo("rice")];
    const create = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValueOnce("blob:soda")
      .mockReturnValueOnce("blob:rice");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    try {
      const handles = createProductThumbnails(rows);
      expect(create).toHaveBeenNthCalledWith(1, rows[0].blob);
      expect(create).toHaveBeenNthCalledWith(2, rows[1].blob);
      expect(handles.thumbnails.get("soda")).toBe("blob:soda");
      expect(handles.thumbnails.get("rice")).toBe("blob:rice");
      expect(handles.thumbnails.get("no-photo")).toBeUndefined();
      handles.dispose();
      expect(revoke.mock.calls).toEqual([["blob:soda"], ["blob:rice"]]);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("releases earlier URLs when a later blob cannot be opened", () => {
    vi.spyOn(URL, "createObjectURL")
      .mockReturnValueOnce("blob:first")
      .mockImplementationOnce(() => {
        throw new Error("unreadable");
      });
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    try {
      expect(() => createProductThumbnails([photo("first"), photo("second")])).toThrow(
        "unreadable",
      );
      expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:first");
    } finally {
      vi.restoreAllMocks();
    }
  });
});
