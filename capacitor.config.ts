import type { CapacitorConfig } from "@capacitor/cli";

/**
 * BentaKo Android shell.
 *
 * `webDir` points at the prerendered client output produced by
 * `npm run build:apk` (BENTAKO_APK=1 vite build). Those files are copied into
 * the APK, so the app boots from bundled assets with no internet at all.
 * There is deliberately NO `server.url` — never point this at a hosted site.
 */
const config: CapacitorConfig = {
  appId: "ph.bentako.app",
  appName: "BentaKo",
  webDir: "dist/client",
  android: {
    // Keep IndexedDB/localStorage durable across app restarts and updates.
    webContentsDebuggingEnabled: false,
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      launchAutoHide: false, // hidden by the app as soon as React mounts
      backgroundColor: "#1f5f47",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
    },
  },
};

export default config;
