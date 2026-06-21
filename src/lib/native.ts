// Native-only enhancements (no-ops on the web). Loaded lazily so the static
// web build is unaffected and Capacitor plugins only run inside the iOS app.

function isNative(): boolean {
  return typeof window !== "undefined" && !!(window as any).Capacitor?.isNativePlatform?.();
}

export async function haptic(kind: "light" | "medium" | "success" = "light") {
  if (!isNative()) return;
  try {
    const { Haptics, ImpactStyle, NotificationType } = await import("@capacitor/haptics");
    if (kind === "success") await Haptics.notification({ type: NotificationType.Success });
    else await Haptics.impact({ style: kind === "medium" ? ImpactStyle.Medium : ImpactStyle.Light });
  } catch {}
}

export async function initNative() {
  if (!isNative()) return;
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({ style: Style.Dark });
  } catch {}
  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.hide();
  } catch {}
}
