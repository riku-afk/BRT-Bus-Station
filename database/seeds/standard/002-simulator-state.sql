-- The worker heartbeat row always exists.
INSERT INTO simulator_state (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;
