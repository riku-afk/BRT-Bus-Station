# BRT Konduktor: the Android app (APK)

A thin native shell (Capacitor 6) around the BRT web app. It does not carry a copy of BRT: it opens the live BRT address, so every
fix to BRT reaches the konduktors **without a new APK**. The shell is here for what a browser cannot do well: the camera for the QR
scanner, the device location (to track the bus), and later background tracking.

Inside the app:
- The user agent carries `BRTKonduktorApp`, so the web app hides passenger registration and signs out anyone who is not a konduktor.
- The app can only ever show the BRT address (`allowNavigation`); any other link opens outside it.
- It asks for the **camera** (scanning) and **location** (the bus's position) when they are first needed.
- If BRT cannot be reached it shows a "Can't reach BRT" page with a Try again button.

## Build an APK

Needs JDK 17 and the Android SDK (`ANDROID_HOME`), both already on this PC. From this folder:

```
npm install                      # once
$env:BRT_APP_URL = "https://brt.example.com"     # PowerShell; where BRT lives (see below)
npm run build:debug              # an installable test APK
npm run build:release            # the roll-out APK (needs the signing key, below)
```

The APK is written to `android/app/build/outputs/apk/debug/app-debug.apk` (or `.../release/app-release.apk`).
`npm run dist` then copies it to `dist/BRT-Konduktor-<version>.apk` (`-debug` for a test build).

### The BRT address (`BRT_APP_URL`)

- **Roll-out:** the public **https** address of BRT. Plain `http` is allowed only for development.
- **Development / pilot on a local PC:** the PC's address on the Wi-Fi the phones use, e.g. `http://10.10.0.4:3000` (the default here).
  BRT must be running (`bun run dev`, listening on all interfaces) and Windows Firewall must allow port 3000.
- The address is baked in at build time. To point at another server, build again (that is the only reason for a new APK).

### Signing the release APK

A release APK must be signed with a key that you keep **forever**: every update has to use the same key, and losing it means a new app.

1. Make the key once (keep the `.jks` file and its passwords somewhere safe, and **never commit them**):
   ```
   keytool -genkey -v -keystore brt-konduktor.jks -keyalg RSA -keysize 2048 -validity 10000 -alias brt-konduktor
   ```
2. Create `android/keystore.properties` (git-ignored):
   ```
   storeFile=../brt-konduktor.jks
   storePassword=...
   keyAlias=brt-konduktor
   keyPassword=...
   ```
3. `npm run build:release`. Without `keystore.properties` the release APK is built unsigned and will not install.

For each new version, raise the numbers: `npm run build:release -- -PbrtVersionCode=2 -PbrtVersionName=0.2.0`
(`brtVersionCode` must go up every time, or Android will refuse to update).

### Installing

Copy the `.apk` to the phone (cable, Drive, WhatsApp) and open it; allow "install unknown apps" for the app that opened it.
Or with a cable and USB debugging on: `adb install -r dist\BRT-Konduktor-0.1.0-debug.apk`.

## Location tracking (next step)

The permissions are already declared (`ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`) so the web app can read the position with
the browser's geolocation while the app is open. Tracking the bus **while the screen is off or the app is in the background** is a
native job and is the next piece of work:

1. Add a background-location plugin (for example `@capacitor-community/background-geolocation`) and, in the manifest,
   `ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE` and `FOREGROUND_SERVICE_LOCATION`. It runs as a foreground service, so Android
   shows a "BRT is tracking this bus" notification: that is required and is what keeps it alive.
2. A BRT endpoint for the konduktor to post positions (the server already records a bus's position in `bus_positions`; the simulator is
   what writes it today). It must take the bus from the signed-in konduktor, never from the request, like scanning does.
3. Google Play wants a short justification for background location; for a private fleet APK installed directly this does not apply.

## Files

| Path | What |
|---|---|
| `capacitor.config.ts` | App id `ph.brt.konduktor`, the BRT address, the user-agent marker |
| `template/offline.html` | The "Can't reach BRT" page (copied to `www/` with the address filled in) |
| `scripts/make-icons.mjs` | Draws the launcher icons (run from the repository root) |
| `android/` | The generated Android project (committed, except build output and keys) |
