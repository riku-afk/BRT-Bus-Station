# Database

PostgreSQL, SQL-first, no ORM.

| Path | Purpose |
|---|---|
| `schema/<domain>/NNN-*.sql` | Fresh-install schema, grouped by domain. Run in the domain order listed in `scripts/migrate.ts`. |
| `updates/NNN-*.sql` | Additive changes for databases that already exist. **Every schema change ships both** (edit `schema/` and add an `updates/` file). |
| `seeds/standard/*.sql` | Idempotent reference data (applied on every `db:migrate`). Demo data lives in `scripts/seed.ts`. |

## Commands

```bash
bun run db:create            # create the database if it does not exist
bun run db:migrate           # apply anything not yet applied
bun run db:migrate:fresh     # local/demo only: drop the public schema and rebuild
bun run db:seed              # load demo data (stations, buses, users, sample tickets)
bun run db:bootstrap         # create the first admin (P1)
```

Each applied file is tracked in `schema_migrations` with a SHA-256 checksum. A file that changes after it was applied
is rejected: add a new `updates/` file instead. On an existing database the `schema/` files are skipped.

## Rules

- Money is `integer` centavos; timestamps are `timestamptz` (UTC).
- `scans` and `payment_events` are insert-only (`forbid_update_delete()` trigger from `prerequisites/002`).
- No capacity, seat or passenger-count columns anywhere.
