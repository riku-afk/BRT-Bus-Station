# Single sign-on with the Smart City app (SCE)

The passenger module is opened from the Smart City mobile app's **Tickets** page. The person is already signed in there, so BRT
signs them in without asking for a password, and the app lists their BRT tickets.

```
Smart City app ── POST /tickets/sso (its own JWT) ──▶ SCE backend (PHP)
                                                       │ signs a 60 s, one-use token  (aud "brt")
              ◀── { url: https://brt…/api/sso/login?token=… } ──┘
Smart City app ── opens that url in the in-app browser ──▶ BRT
                                                       │ checks the token, finds / creates the passenger,
                                                       │ sets BRT's own session cookie, redirects to /
Passenger pages (map, buy a ticket, pay by QR Ph, My tickets): already signed in

Smart City app ── GET /tickets/mine ──▶ SCE backend ── GET /api/partner/tickets (Bearer, aud "brt-api") ──▶ BRT
                                                       ◀── the citizen's tickets (no QR codes)
```

## Settings (BRT `.env`; the same secret goes in the SCE backend `.env`)

| Variable | Meaning |
|---|---|
| `SSO_ENABLED` | `true` to turn the two endpoints on. Off: they answer 404. |
| `SSO_SHARED_SECRET` | At least 32 characters. Signs and verifies the tokens (HS256). Never in the mobile app. Must not start with `dev-only` in prod. |
| `SSO_ISSUER` | `iss` the partner puts in its tokens. Default `sce`. |
| `SSO_AUDIENCE` | `aud` of the hand-off token. Default `brt`. |
| `SSO_API_AUDIENCE` | `aud` of the ticket-list token. Default `brt-api`. A token for one cannot be used for the other. |
| `SSO_MAX_TOKEN_AGE_SECONDS` | A token older than this is refused even if its own expiry is later. Default 120. |

## Token (JWT, HS256)

Standard claims: `iss`, `aud`, `sub` (the citizen's id in SCE, **required, this is what identifies the person**), `iat`, `exp` (about 60 seconds), `jti` (unique).
Extra claims for the hand-off token: `name`, `email`.

## Rules BRT applies

- The signature, algorithm (HS256 only), issuer, audience, expiry and age are all checked.
- A hand-off token works **once** (its `jti` is recorded in `sso_token_uses`).
- A person is found by `(external_provider = 'sce', external_id = sub)`, never by email. The first time, a passenger account is created.
  If the email already belongs to another BRT account, the SSO account gets a placeholder address instead of being merged into it.
- Only **passengers** can sign in this way. An admin or konduktor, or an inactive account, is refused.
- `next` can only be `/`, `/tickets` or `/tickets/<id>`. Anything else goes to `/`.
- A refused link redirects to `/login?sso=failed`, which tells the person to open Tickets in the app again.
- `GET /api/partner/tickets?page=&pageSize=&filter=` returns one page (10 by default, at most 50) of tickets only, with no QR token, for the citizen named by the Bearer token, with the count under each filter (`all`, `pay`, `ready`, `past`).
- `GET /api/partner/tickets/{id}/qr.png` returns the QR image of one **paid** ticket of that citizen (409 if it is not paid, 404 if it is not theirs). The SCE backend hands it to the app as a PNG data URL (`GET /tickets/{id}/qr`) for the ticket popup; it is not stored or logged.
- The SCE backend does not check `account_status` (the citizen table holds Verified / Pending / Certified or nothing): like its own sign-in, it refuses only a deleted account.

## Trying it without the app

```
# .env: SSO_ENABLED=true, SSO_SHARED_SECRET=<32+ characters>
bun run db:migrate                       # update 016 adds the SSO columns
bun run scripts/sso-token.ts 1001 --name "Juan Dela Cruz" --email juan@example.com
bun run scripts/sso-token.ts 1001 --api  # prints a curl for the ticket list
```

## Notes

- The token is in the URL for up to a minute, one use. BRT's logs record only the path, never the query.
- The session cookie is set by BRT for BRT's own address, so open BRT as a top-level page (the in-app browser), not in an iframe.
- When the BRT session ends (12 hours by default), the person sees the sign-in page: they go back to the app and tap Tickets again.
