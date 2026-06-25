import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "gg.askai.app",
  appName: "AskAI",
  webDir: "out",
  backgroundColor: "#0b0b10",
  ios: {
    contentInset: "always",
    backgroundColor: "#0b0b10",
    scrollEnabled: true,
  },
  plugins: {
    SplashScreen: { launchShowDuration: 600, backgroundColor: "#0b0b10", showSpinner: false },
    StatusBar: { style: "DARK", backgroundColor: "#0b0b10" },
  },
};

export default config;
