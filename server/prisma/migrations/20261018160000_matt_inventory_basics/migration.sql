-- Salt, oil and spices are ordinary ingredients now (the "always have" idea is
-- gone), so what counts as "you have it" is only what is in Inventory. This puts
-- the 23 basics Matt chose into HIS Inventory (the account matthieugagnon@me.com,
-- no other) as ordinary items: Garde-manger shelf, no amount, no use-by date.
--
-- An item is skipped when that account already holds it under one of the names
-- recipes call it, in English or French ("Sea salt", "Sel", "Huile d'olive"...),
-- so nothing is doubled. Without that account (a new or test database) it adds
-- nothing. Only inserts rows; nothing is dropped, renamed or changed.
WITH basics (name, category, aliases) AS (
  VALUES
    ('Salt', 'Shelf Stable Foods', ARRAY['salt', 'sel', 'sea salt', 'sel de mer', 'kosher salt', 'sel casher', 'coarse salt', 'gros sel', 'table salt', 'sel de table', 'fine sea salt']),
    ('Black pepper', 'Shelf Stable Foods', ARRAY['black pepper', 'pepper', 'poivre', 'poivre noir', 'ground black pepper', 'ground pepper', 'poivre moulu', 'poivre noir moulu', 'cracked black pepper']),
    ('Olive oil', 'Condiments, Sauces & Canned Goods', ARRAY['olive oil', 'extra virgin olive oil', 'extra-virgin olive oil', 'huile d''olive', 'huile d''olive extra vierge']),
    ('Vegetable oil', 'Condiments, Sauces & Canned Goods', ARRAY['vegetable oil', 'canola oil', 'cooking oil', 'huile vegetale', 'huile de canola', 'huile de cuisson']),
    ('Sugar', 'Shelf Stable Foods', ARRAY['sugar', 'white sugar', 'granulated sugar', 'sucre', 'sucre blanc']),
    ('Brown sugar', 'Shelf Stable Foods', ARRAY['brown sugar', 'sucre brun', 'cassonade']),
    ('All-purpose flour', 'Shelf Stable Foods', ARRAY['flour', 'all-purpose flour', 'all purpose flour', 'farine', 'farine tout usage']),
    ('Baking powder', 'Shelf Stable Foods', ARRAY['baking powder', 'poudre a pate', 'poudre a lever']),
    ('Baking soda', 'Shelf Stable Foods', ARRAY['baking soda', 'bicarbonate de soude']),
    ('Soy sauce', 'Condiments, Sauces & Canned Goods', ARRAY['soy sauce', 'sauce soya', 'sauce soja']),
    ('Vinegar', 'Condiments, Sauces & Canned Goods', ARRAY['vinegar', 'white vinegar', 'vinaigre', 'vinaigre blanc']),
    ('Vanilla extract', 'Condiments, Sauces & Canned Goods', ARRAY['vanilla extract', 'pure vanilla extract', 'extrait de vanille']),
    ('Cornstarch', 'Shelf Stable Foods', ARRAY['cornstarch', 'corn starch', 'fecule de mais']),
    ('Garlic powder', 'Shelf Stable Foods', ARRAY['garlic powder', 'poudre d''ail']),
    ('Onion powder', 'Shelf Stable Foods', ARRAY['onion powder', 'poudre d''oignon']),
    ('Paprika', 'Shelf Stable Foods', ARRAY['paprika', 'smoked paprika', 'sweet paprika', 'paprika fume']),
    ('Cumin', 'Shelf Stable Foods', ARRAY['cumin', 'ground cumin', 'cumin moulu']),
    ('Oregano', 'Shelf Stable Foods', ARRAY['oregano', 'dried oregano', 'origan', 'origan seche']),
    ('Cinnamon', 'Shelf Stable Foods', ARRAY['cinnamon', 'ground cinnamon', 'cannelle', 'cannelle moulue']),
    ('Chili powder', 'Shelf Stable Foods', ARRAY['chili powder', 'chile powder', 'poudre de chili']),
    ('Red pepper flakes', 'Shelf Stable Foods', ARRAY['red pepper flakes', 'chili flakes', 'crushed red pepper', 'flocons de piment']),
    ('Bay leaf', 'Shelf Stable Foods', ARRAY['bay leaf', 'bay leaves', 'feuille de laurier', 'feuilles de laurier', 'laurier']),
    ('Italian seasoning', 'Shelf Stable Foods', ARRAY['italian seasoning', 'assaisonnement italien'])
)
INSERT INTO "PantryInventoryItem" ("id", "userId", "name", "core", "category", "location")
SELECT 'basics' || substr(md5(u."id" || b.name), 1, 20), u."id", b.name, lower(b.name), b.category, 'pantry'
FROM "User" u
CROSS JOIN basics b
WHERE lower(u."email") = 'matthieugagnon@me.com'
  AND NOT EXISTS (
    SELECT 1
    FROM "PantryInventoryItem" i
    WHERE i."userId" = u."id"
      AND NOT i."isLeftover"
      AND translate(lower(i."name"), 'àâäéèêëîïôöùûüç’', 'aaaeeeeiioouuuc''') = ANY (b.aliases)
  );
