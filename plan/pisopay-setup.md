# PisoPay — setup and how it works

The app has two payment providers behind one interface (`src/server/integrations/payment`):

| `PAYMENT_PROVIDER` | What it is |
|---|---|
| `mock` (default) | Offline demo gateway. Its Pay / Fail buttons send a signed webhook through the real webhook path. |
| `pisopay` | PisoPay **redirect checkout**, ported from the e-Notary system (`PaymentService.php` + `PisoPayService.php`). |

## `.env`

```
PAYMENT_PROVIDER=pisopay
PISOPAY_BASE_URL=https://api-checkout.pisopay.com.ph
PISOPAY_API_USERNAME=<from your senior>
PISOPAY_API_PASSWORD=<from your senior>
PISOPAY_PROCESSOR_NAME=<see below>
APP_BASE_URL=<the address PisoPay can reach this app on, no trailing slash>
```

e-Notary's config has the same four PisoPay values (`BASE_URL`, `API_USERNAME`, `API_PASSWORD`, `CHECKOUT_TYPE`). Differences here:

- `CHECKOUT_TYPE`: only **redirect** is built. "Embedded" (an OTC reference number or QR shown inside the app) can be added later.
- `PISOPAY_PROCESSOR_NAME`: e-Notary sends the fixed string `eNotary` as `processor_name`. It may be a value PisoPay registered for that merchant, so **ask your senior what it should be for this system**. The default `BRTBusStation` is a guess.
- The webhook URL is not configured anywhere: it is sent to PisoPay with every payment (`merchant_callback_url`), built from `APP_BASE_URL`. It is `{APP_BASE_URL}/api/payments/webhook/pisopay` (e-Notary's is `/api/payments/pisopay/webhook`). Nothing to register with PisoPay for it.

The app refuses to start with `PAYMENT_PROVIDER=pisopay` if the username or password is missing.

## What happens on a payment (same steps as e-Notary)

1. The passenger presses **Pay** on a ticket. The server (using the ticket's frozen fare, never anything the browser sent):
   1. `GET /api/v1/session` -> `session_id`
   2. `POST /api/v1/token` with the amount (`33.00`), a `merchant_trace_no`, `transaction_type: CASHIN`, the passenger's name and email, the webhook URL, the return URL, the passenger's IP and the ticket's pay-by time as `expiry_date`
   3. PisoPay answers with a checkout URL and the passenger is redirected to it.
2. `merchant_trace_no` is `BRT` + 14 characters of the payment's id (17 characters; PisoPay allows 20). It is stored as the payment's provider reference and is how the webhook finds the payment.
3. The passenger pays on PisoPay's page and returns to the ticket page, which only *reads* the ticket and waits.
4. PisoPay `POST`s the result to the webhook. The server checks the `hd` signature the way e-Notary does:
   - `auth` = first 10 characters of `sha256("<username>:<password>" + timestamp)`
   - `hd` = `HMAC-SHA256(key = timestamp, message = auth + traceNo + amount)` for status `0`; for any other status the message is `auth + traceNo + status + amount`
5. Only status `0` (paid) is acted on, like e-Notary. The payment is then looked up by trace number, the event is recorded once (a redelivery changes nothing), and the **amount paid must equal the ticket fare** before the ticket becomes paid. Anything that does not add up is kept as *needs review* on the admin Payments page.

## Deliberate differences from e-Notary

- TLS certificates are **verified** (e-Notary's Guzzle client has `verify => false`).
- PisoPay request / response bodies are **not logged or stored** (they carry the passenger's name and email). e-Notary keeps `pisopay_api_logs`; here the evidence is `payment_events` (a hash of each webhook body) and the admin Payments page.
- No source-IP allow-list (e-Notary has none for PisoPay either; the signature is the check).
- The webhook is the only thing that can mark a ticket paid. e-Notary also lets a "verify" endpoint and a status poll do it; neither exists here.

## Testing it locally

PisoPay has to reach your machine to deliver the result, so `APP_BASE_URL` must be a public https address: run a tunnel (`cloudflared tunnel --url http://localhost:3000` or `ngrok http 3000`), set `APP_BASE_URL` to its address, restart, and **use that address in the browser** too (cookies are per address, and PisoPay returns the passenger to `APP_BASE_URL`).

Without a PisoPay account or tunnel the tests still cover the whole path (checkout, signed webhook, tampering, redelivery, wrong amount) with PisoPay's API stubbed: `bun run test -- pisopay`.

## Things to confirm with PisoPay / your senior

- **`processor_name`** (above).
- **Passenger phone number.** The token has `customer_phone`; passengers have no phone on file, so an empty string is sent. If PisoPay requires it, registration needs a phone field.
- **Does `amount` in the webhook include channel fees?** The webhook also has `otherFeesTotal`. If `amount` includes fees, a correct payment would be flagged as an amount mismatch; compare with a sandbox payment.
- **Minimum amount** and which channels the merchant account has enabled.
- **Timestamp format / expiry timezone.** `expiry_date` is sent as Manila time `YYYY-MM-DD HH:mm:ss`.
- **Payload samples** in `pisopay.provider.test.ts` follow e-Notary's code; replace them with captured sandbox deliveries.
