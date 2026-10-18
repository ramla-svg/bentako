import mark from "@/assets/bentako-storefront.svg";
import { cn } from "@/lib/utils";

/** One app-owned mark; merchant receipt logos remain independent. */
export function BrandMark({ className, label = "" }: { className?: string; label?: string }) {
  return <img src={mark} alt={label} width={100} height={100} className={cn("block size-11 shrink-0", className)} />;
}