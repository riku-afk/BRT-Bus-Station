-- Default fare rule: PHP 15.00 base + PHP 2.00 per station. Never overwrites admin changes.
INSERT INTO fare_settings (id, base_fare_centavos, per_station_centavos)
VALUES (1, 1500, 200)
ON CONFLICT (id) DO NOTHING;
