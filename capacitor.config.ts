import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "gg.agentnexus.app",
  appName: "AgentNexus",
  webDir: "out",
  backgroundColor: "#0b0b10",
  ios: {
    contentInset: "always",
    backgroundColor: "#0b0b10",
  },
  plugins: {
    SplashScreen: { launchShowDuration: 600, backgroundColor: "#0b0b10", showSpinner: false },
  },
};

export default config;
