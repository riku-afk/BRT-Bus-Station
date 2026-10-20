import type { CapacitorConfig } from '@capacitor/cli';

/**
 * BRT Konduktor, the Android app: a thin native shell around the BRT web app.
 *
 * BRT is one server-rendered app (pages and API together), so the app does not carry a copy of it: it opens the live BRT address.
 * Every fix to BRT therefore reaches the konduktors without a new APK. The shell adds what a browser cannot: the camera for the QR
 * scanner, the device location (to track the bus; see README.md), and later background tracking.
 *
 * Set the address when building:  BRT_APP_URL=https://brt.example.com npm run build:release
 * Plain http is only allowed for development (a PC on the same Wi-Fi); a real roll-out must use https.
 */
const url = (process.env.BRT_APP_URL ?? 'http://10.10.0.4:3000').replace(/\/+$/, '');
const secure = url.startsWith('https://');
const host = new URL(url).host;

const config: CapacitorConfig = {
  appId: 'ph.brt.konduktor',
  appName: 'BRT Konduktor',
  // Shown only when the server cannot be reached (see www/index.html).
  webDir: 'www',
  server: {
    url,
    cleartext: !secure,
    androidScheme: secure ? 'https' : 'http',
    // The app may only ever show BRT: any other address opens outside the app.
    allowNavigation: [host],
    errorPath: 'index.html',
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#0f172a',
    // The web app recognises this to hide passenger sign-up and to refuse anyone who is not a konduktor.
    appendUserAgent: 'BRTKonduktorApp',
    webContentsDebuggingEnabled: false,
  },
};

export default config;
