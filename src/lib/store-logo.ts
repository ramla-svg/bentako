/**
 * Receipt logo for Pro shops. The image lives in the private `store-logos`
 * bucket under the store's own folder; `stores.logo_url` keeps the object path,
 * and a short-lived signed URL is resolved when a receipt needs to show it.
 */
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { downscaleImage } from "@/lib/image-file";

const BUCKET = "store-logos";

export async function uploadStoreLogo(storeId: string, file: File | Blob): Promise<string> {
  const small = await downscaleImage(file, 512, 0.85);
  const path = `${storeId}/logo-${Date.now()}.jpg`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, small, { contentType: "image/jpeg", upsert: true });
  if (error) throw error;
  const { error: updateError } = await supabase
    .from("stores")
    .update({ logo_url: path })
    .eq("id", storeId);
  if (updateError) throw updateError;
  return path;
}

export async function removeStoreLogo(storeId: string, path: string | null): Promise<void> {
  if (path) await supabase.storage.from(BUCKET).remove([path]);
  const { error } = await supabase.from("stores").update({ logo_url: null }).eq("id", storeId);
  if (error) throw error;
}

const cache = new Map<string, { url: string; until: number }>();

export async function storeLogoUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const hit = cache.get(path);
  if (hit && hit.until > Date.now()) return hit.url;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) return null;
  cache.set(path, { url: data.signedUrl, until: Date.now() + 45 * 60_000 });
  return data.signedUrl;
}

/** Resolves a viewable URL for the shop logo; null while loading or offline. */
export function useStoreLogo(path: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!path) {
      setUrl(null);
      return;
    }
    void storeLogoUrl(path).then((next) => {
      if (alive) setUrl(next);
    });
    return () => {
      alive = false;
    };
  }, [path]);
  return url;
}
