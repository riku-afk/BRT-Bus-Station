# Running BRT on this PC with Docker (to try it on a phone)

For testing the Android app, or a phone browser, on the same Wi-Fi. **Not for production**: plain http, development secrets,
`APP_ENV=demo` and the bus simulator.

## Start it

```powershell
cd D:\PROJECTS\brt-bus-station
$env:BRT_HOST_IP = "10.10.0.4"        # this PC's address on the Wi-Fi the phone uses (ipconfig, "IPv4 Address")
docker compose -f docker-compose.demo.yml up --build -d
```

The first run builds the image (a few minutes). It then:
1. starts PostgreSQL (inside Docker, not published, so it does not clash with a Postgres on this PC),
2. creates the tables and loads the demo data (`setup`, runs once and exits),
3. starts the web app (`web`) on **http://10.10.0.4:8080** and the bus simulator and ticket-expiry worker (`workers`).

Demo accounts (password `Demo1234!`): `admin@brt.test`, `konduktor1@brt.test` (Bus 1), `konduktor2@brt.test`, `konduktor3@brt.test`,
`passenger1@brt.test`, `passenger2@brt.test`.

Change the port with `$env:BRT_PORT = "9000"` (and build the APK for the same address).

## Let the phone reach it

- The phone and this PC must be on the **same Wi-Fi**.
- Windows Firewall must allow the port. In an **administrator** PowerShell:
  ```powershell
  netsh advfirewall firewall add rule name="BRT demo 8080" dir=in action=allow protocol=TCP localport=8080
  ```
- Check from the phone's browser: `http://10.10.0.4:8080` shows the BRT sign-in page.
- If the PC's address changes (a new Wi-Fi, a new lease), set `BRT_HOST_IP` again, restart the stack, and rebuild the APK for the new address.

## The Android app

Build the APK for this address (PowerShell, from `mobile\konduktor`):

```powershell
$env:BRT_APP_URL = "http://10.10.0.4:8080"
npm run build:debug
npm run dist          # dist\BRT-Konduktor-0.1.0-debug.apk
```

## Everyday commands

```powershell
docker compose -f docker-compose.demo.yml ps                 # what is running
docker compose -f docker-compose.demo.yml logs -f web        # the app's log (also: workers, setup, db)
docker compose -f docker-compose.demo.yml restart workers
docker compose -f docker-compose.demo.yml down               # stop; the data stays in the brt-pgdata volume
docker compose -f docker-compose.demo.yml down -v            # stop and DELETE the data (the next start reloads the demo data)
docker compose -f docker-compose.demo.yml up --build -d      # after changing the code: rebuild and restart
```

## Notes

- **Payments go through PisoPay (QR Ph)**, using the credentials in .env (PAYMENT_PROVIDER, PISOPAY_API_USERNAME, PISOPAY_API_PASSWORD; the processor name and QR channels have defaults). These are REAL payments in whatever mode those credentials are for, and the amount must be at least 1 peso. PisoPay cannot reach this PC to send its webhook, so the ticket page asks PisoPay for the status while it waits (that is how it learns a payment went through). For the offline demo gateway (Pay / Fail buttons) set PAYMENT_PROVIDER=mock in .env and restart. If PisoPay limits calls to known IP addresses, they come from this PC's internet address.
- Roads between shelters come from the public OSRM server and need internet while `setup` runs. Without it the buses still run, on
  straight lines; run `docker compose -f docker-compose.demo.yml run --rm setup` later to fetch them.
- **The camera needs a secure address.** Android only lets a web page (a phone browser, and the app's WebView too) use the camera on
  **https** or on `localhost`. `http://10.10.0.4:8080` is neither, so the QR scanner will say the camera is unavailable there; typing the
  reference code (the fallback on the Scan page) still works. To test the camera, use one of these:
  - **USB cable (simplest):** turn on USB debugging, connect the phone, run `adb reverse tcp:8080 tcp:8080`, and build the APK for
    `http://localhost:8080`. To the phone that is `localhost`, which counts as secure. (`adb` is in `%LOCALAPPDATA%\Android\Sdk\platform-tools`.)
  - **A public https address** from a tunnel (Cloudflare Tunnel or ngrok) pointed at port 8080. Build the APK for that address. This also gives
    PisoPay a public address for its webhook.
- Port 3000 is left free for `bun run dev`; this stack uses 8080.
