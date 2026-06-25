# AskAI — native iOS app (SwiftUI)

A real native **SwiftUI** app. The UI is a full-screen `WKWebView` rendering the
live AskAI web app (so it looks exactly like the website), wrapped in native
chrome: an **official Liquid Glass** status-bar bar (iOS 26 `glassEffect`, with a
frosted-material fallback on older iOS), a slim load-progress bar, pull-to-refresh,
edge-swipe back/forward, haptics, a native splash, and an offline retry screen.

- Source: `Sources/` (`AskAIApp`, `RootView`, `WebView`)
- Project is defined with [XcodeGen](https://github.com/yonyz/XcodeGen) (`project.yml`)
- Bundle id: `gg.askai.app` · min iOS 16 · portrait

## Get the .ipa (no Mac needed)

The `.github/workflows/ios.yml` workflow builds an **unsigned `.ipa`** on a free
GitHub macOS runner and:

1. uploads it as the **`AskAI-ipa`** artifact, and
2. attaches it to the rolling **`ios-latest`** pre-release.

Trigger it from the repo's **Actions → "Build iOS app (.ipa)" → Run workflow**
(or it runs automatically when `ios-native/**` changes on `main`).

### Sideload onto your iPhone
Open the `.ipa` with **AltStore** or **Sideloadly** — they re-sign it with your
own free Apple ID and install it (free Apple IDs expire after 7 days; paid
developer accounts last a year). A signing service works too.

## Build locally (if you have a Mac)
```bash
brew install xcodegen
cd ios-native
xcodegen generate
open AskAI.xcodeproj   # then Run on your device/simulator
```
