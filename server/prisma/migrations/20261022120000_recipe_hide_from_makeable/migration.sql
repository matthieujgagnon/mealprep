-- « Masquer de Faisable » / "Hide from Makeable": one yes-or-no choice per recipe, made by the
-- person from the recipe card's ⋯ menu or the editor. Add-only: one new column on "Recipe";
-- nothing is dropped, renamed or rewritten.
--
-- It is off for every existing recipe, so nothing changes until someone hides one. The recipe
-- stays on Recipes, in the Planner search and in its meal types; only Makeable's suggestions
-- (Ready now, the suggestion sections and the Makeable counts) leave it out. It goes with the
-- recipe (and its account) like the rest of the row.
ALTER TABLE "Recipe" ADD COLUMN "hiddenFromMakeable" BOOLEAN NOT NULL DEFAULT false;
