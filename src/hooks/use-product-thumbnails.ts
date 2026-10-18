import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";

import { db, type LocalProductPhoto } from "@/lib/local-db";

export async function readProductPhotos(storeId: string): Promise<LocalProductPhoto[]> {
  return storeId ? db().product_photos.where("store_id").equals(storeId).toArray() : [];
}

/** Object URLs are temporary display handles, never saved to product rows. */
export function createProductThumbnails(photos: LocalProductPhoto[]) {
  const thumbnails = new Map<string, string>();
  const urls: string[] = [];
  const dispose = () => urls.forEach((url) => URL.revokeObjectURL(url));
  try {
    for (const photo of photos) {
      const url = URL.createObjectURL(photo.blob);
      urls.push(url);
      thumbnails.set(photo.product_id, url);
    }
  } catch (error) {
    dispose();
    throw error;
  }
  return { thumbnails, dispose };
}

export function useProductThumbnails(storeId: string) {
  const photos = useLiveQuery(
    async () => ({ storeId, rows: await readProductPhotos(storeId) }),
    [storeId],
  );
  const [current, setCurrent] = useState<{
    storeId: string;
    thumbnails: Map<string, string>;
  } | null>(null);

  useEffect(() => {
    if (!photos || photos.storeId !== storeId) return;
    const handles = createProductThumbnails(photos.rows);
    setCurrent({ storeId, thumbnails: handles.thumbnails });
    return handles.dispose;
  }, [photos, storeId]);

  return current?.storeId === storeId ? current.thumbnails : undefined;
}
