import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { UpdateBanner } from "@/components/update-banner";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AppSessionProvider } from "@/hooks/use-app-session";
import { registerServiceWorker } from "@/lib/register-sw";
import { BUILD_ID, BUILD_META_NAME } from "@/lib/build-info";
import { initNativeBridge } from "@/lib/platform/native-bridge";


function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong. Your saved sales and stock are safe on this device — try again.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "BentaKo — Offline Sari-Sari Store POS" },
      {
        name: "description",
        content:
          "BentaKo is a fast, offline-first point of sale and inventory app made for Philippine sari-sari stores.",
      },
      { name: "theme-color", content: "#1f5f47" },
      { name: BUILD_META_NAME, content: BUILD_ID },
      { property: "og:title", content: "BentaKo — Offline Sari-Sari Store POS" },
      {
        property: "og:description",
        content: "Sell, track stock, and record expenses even without internet.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/icons/icon-192.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Outfit:wght@500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

/**
 * Every BentaKo route is client-rendered, so a failed script load would leave a
 * blank white page with no way out. This static panel ships in the HTML itself:
 * it is hidden the moment React mounts, and stays visible (with one automatic
 * cache-busting reload) if startup fails.
 */
const BOOT_FALLBACK_SCRIPT = `(function(){
  var el=document.getElementById('bentako-boot');
  if(!el)return;
  var hide=function(){ if(el&&el.parentNode) el.style.display='none'; };
  window.addEventListener('bentako:ready',hide);
  var t=setTimeout(function(){ el.style.visibility='visible'; },1200);
  var reloaded=false;
  var recover=function(msg){
    if(reloaded)return; 
    if(!/chunk|dynamically imported module|Importing a module script failed|Failed to fetch/i.test(String(msg||'')))return;
    var k='bentako_boot_retry';
    try{ if(sessionStorage.getItem(k)){ el.style.visibility='visible'; return; } sessionStorage.setItem(k,'1'); }catch(e){}
    reloaded=true; clearTimeout(t);
    var u=new URL(window.location.href); u.searchParams.set('_bk',String(Date.now()));
    window.location.replace(u.toString());
  };
  window.addEventListener('error',function(e){ recover((e&&e.message)||(e&&e.target&&e.target.src)); });
  window.addEventListener('unhandledrejection',function(e){ recover(e&&e.reason&&(e.reason.message||e.reason)); });
})();`;

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <div
          id="bentako-boot"
          suppressHydrationWarning
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            visibility: "hidden",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "12px",
            background: "#ffffff",
            color: "#1f2937",
            font: "500 15px/1.4 system-ui, -apple-system, sans-serif",
            textAlign: "center",
            padding: "24px",
          }}
        >
          <div style={{ fontSize: "20px", fontWeight: 800 }}>BentaKo</div>
          <div>Starting BentaKo…</div>
          <a
            href="/"
            style={{
              marginTop: "8px",
              padding: "10px 18px",
              borderRadius: "10px",
              background: "#1f5f47",
              color: "#ffffff",
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            Reload
          </a>
        </div>
        <script dangerouslySetInnerHTML={{ __html: BOOT_FALLBACK_SCRIPT }} />
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    // Startup succeeded: hide the static boot panel and clear the retry guard.
    window.dispatchEvent(new Event("bentako:ready"));
    const boot = document.getElementById("bentako-boot");
    if (boot) boot.style.display = "none";
    try {
      sessionStorage.removeItem("bentako_boot_retry");
    } catch {
      /* storage unavailable */
    }
    registerServiceWorker();
    initNativeBridge();
  }, []);



  return (
    <QueryClientProvider client={queryClient}>
      <AppSessionProvider>
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
        <UpdateBanner />
        <Toaster position="top-center" />
      </AppSessionProvider>
    </QueryClientProvider>
  );
}
