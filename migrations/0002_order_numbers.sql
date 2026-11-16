-- Voer deze migratie EERST uit op de bestaande Cloudflare D1-database.
-- De interne UUID blijft ongewijzigd. Klanten zien een korte, unieke en oplopende referentie.
CREATE TABLE IF NOT EXISTS order_numbers (
 number INTEGER PRIMARY KEY AUTOINCREMENT,
 order_id TEXT NOT NULL UNIQUE REFERENCES orders(id)
);
-- Bestaande bestellingen krijgen een vaste referentie in aanmaakvolgorde.
INSERT OR IGNORE INTO order_numbers(order_id)
 SELECT id FROM orders ORDER BY created_at, id;
