import * as cheerio from "cheerio";

/**
 * Fetches a recipe URL and extracts structured recipe data.
 * Strategy:
 *   1. Look for schema.org/Recipe JSON-LD (most recipe sites include this for SEO/Google)
 *      for title, ingredients, instructions, servings, times — this stays the reliable
 *      backbone since it's structured data, not per-site guesswork.
 *   2. For photos specifically, structured data alone is often too thin — most sites only
 *      list one "hero" image in JSON-LD even when the page visually shows several. So we
 *      supplement with a best-effort scan of <img> tags inside the page's recipe-card
 *      container, filtered to exclude obvious non-recipe images (icons, logos, related-post
 *      thumbnails). This part IS a per-site heuristic and won't be perfect everywhere.
 *   3. If no structured Recipe data exists at all, throw so the caller falls back to manual entry.
 */
export async function scrapeRecipe(url) {
  const res = await fetch(url, {
    headers: {
      // A self-declared bot UA gets blocked outright by WordPress-based
      // bot-protection plugins (Wordfence, Cloudflare's basic bot rules)
      // that a lot of food blogs run — this looks like an ordinary desktop
      // Chrome request instead, which is what actually lets us through.
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  if (!res.ok) {
    throw new Error(`FETCH_FAILED: Failed to fetch URL (status ${res.status})`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  const ldJsonBlocks = $('script[type="application/ld+json"]')
    .map((_, el) => $(el).contents().text())
    .get();

  const recipeNode = findRecipeNode(ldJsonBlocks);

  if (!recipeNode) {
    // Try extracting from plain article body before giving up — some sites
    // (Vice/Munchies, food blogs, newspaper sites) write recipes as prose
    // articles with "Ingredients" and "Directions" headings, no JSON-LD.
    const articleRecipe = extractRecipeFromArticleBody($, url);
    if (articleRecipe) return articleRecipe;

    throw new Error(
      "NO_STRUCTURED_DATA: Could not find recipe data on this page. Try manual entry."
    );
  }

  const domPhotos = extractDomImages($, url);
  const domGroups = extractIngredientGroupsFromDom($);
  const domStepImages = extractStepImagesFromDom($, url);

  return normalizeRecipe(recipeNode, url, domPhotos, domGroups, domStepImages);
}

// Splits a <p>/<li>'s inner HTML on <br> tags and returns the trimmed text
// of each resulting line, dropping empties. Re-parses each fragment with
// cheerio (rather than a regex strip) so inline tags inside a line — <em>,
// <strong>, <a> for a linked ingredient — still resolve to plain text
// correctly instead of leaving stray markup in the ingredient name.
function splitOnLineBreaks($node) {
  const html = $node.html() || "";
  return html
    .split(/<br\s*\/?>/i)
    .map((fragment) => cheerio.load(`<div>${fragment}</div>`)("div").text().replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

// Fallback for sites that write recipes as plain articles (Vice/Munchies,
// newspaper food sections, etc.) with no schema.org JSON-LD. Looks for an
// "Ingredients" heading followed by lists, and a "Directions"/"Instructions"
// heading followed by an ordered list or numbered paragraphs.
function extractRecipeFromArticleBody($, sourceUrl) {
  try {
    const title = $("h1").first().text().trim() || $("title").text().split("|")[0].trim() || "Untitled Recipe";

    // Find all headings and their siblings to locate ingredient/instruction blocks
    const headings = $("h1, h2, h3, h4, strong, em").toArray();

    let ingredientGroups = [];
    let instructionTexts = [];
    let servings = null;

    // Extract servings from common patterns like "Servings: 4"
    const bodyText = $("body").text();
    const servingsMatch = bodyText.match(/servings?:\s*(\d+)/i) || bodyText.match(/serves\s*:?\s*(\d+)/i) || bodyText.match(/yield[s]?\s*:?\s*(\d+)/i);
    if (servingsMatch) servings = parseInt(servingsMatch[1], 10);

    for (let i = 0; i < headings.length; i++) {
      const headingText = $(headings[i]).text().toLowerCase().trim();
      const isIngredients = /^ingredients?/.test(headingText);
      const isDirections = /^(directions?|instructions?|method|steps?|preparation)/.test(headingText);

      if (!isIngredients && !isDirections) continue;

      // Gather all content nodes after this heading until the next major heading
      const $heading = $(headings[i]);
      let currentGroup = headingText === "ingredients" ? null : headingText;
      let groupItems = [];

      // Walk siblings after the heading
      let $node = $heading.next();
      let safetyLimit = 40;
      while ($node.length && safetyLimit-- > 0) {
        const tag = $node.prop("tagName")?.toLowerCase();

        // A new major heading signals the end of this section
        if (["h1", "h2", "h3"].includes(tag)) break;

        if (tag === "ul" || tag === "ol") {
          if (isIngredients) {
            $node.find("li").each((_, li) => {
              const text = $(li).text().replace(/\s+/g, " ").trim();
              if (text) groupItems.push(text);
            });
          } else {
            $node.find("li").each((_, li) => {
              const text = $(li).text().replace(/\s+/g, " ").trim();
              if (text) instructionTexts.push(text);
            });
          }
        } else if (tag === "p" || tag === "li") {
          // Vice/Munchies and several other WordPress food sites put an
          // entire ingredient group (or the whole method) inside ONE <p>,
          // with individual lines separated by <br> tags rather than
          // separate <li>/<p> elements. Handling those the same way as a
          // normal paragraph (just $node.text()) collapses every line into
          // one giant run-on ingredient/step. Detect that shape first and
          // split on the <br>s so each line becomes its own item.
          if ($node.find("br").length > 0 && (isIngredients || isDirections)) {
            const lines = splitOnLineBreaks($node);
            for (const lineText of lines) {
              if (isIngredients && /^(for the |for )/i.test(lineText) && lineText.endsWith(":")) {
                if (groupItems.length) {
                  ingredientGroups.push({ name: currentGroup, items: groupItems });
                  groupItems = [];
                }
                currentGroup = lineText.replace(/:$/, "").trim();
              } else if (isIngredients) {
                groupItems.push(lineText);
              } else if (isDirections) {
                const clean = lineText.replace(/^\d+[\.\)]\s*/, "").trim();
                if (clean.length > 10) instructionTexts.push(clean);
              }
            }
            $node = $node.next();
            continue;
          }

          const text = $node.text().replace(/\s+/g, " ").trim();
          if (!text) { $node = $node.next(); continue; }

          // Italic/bold "for the X:" patterns signal a sub-group in ingredients
          if (isIngredients && /^(for the |for )/i.test(text) && text.endsWith(":")) {
            if (groupItems.length) {
              ingredientGroups.push({ name: currentGroup, items: groupItems });
              groupItems = [];
            }
            currentGroup = text.replace(/:$/, "").trim();
          } else if (isIngredients) {
            groupItems.push(text);
          } else if (isDirections) {
            // Strip leading numbers like "1." or "Step 1:" from prose directions
            const clean = text.replace(/^\d+[\.\)]\s*/, "").trim();
            if (clean.length > 10) instructionTexts.push(clean);
          }
        } else if (tag === "em" || tag === "strong") {
          // Vice wraps group headers in <em> or <strong> inline
          const text = $node.text().replace(/\s+/g, " ").trim();
          if (isIngredients && text.startsWith("for") && text.endsWith(":")) {
            if (groupItems.length) {
              ingredientGroups.push({ name: currentGroup, items: groupItems });
              groupItems = [];
            }
            currentGroup = text.replace(/:$/, "").trim();
          }
        }

        $node = $node.next();
      }

      if (isIngredients && groupItems.length) {
        ingredientGroups.push({ name: currentGroup, items: groupItems });
      }
    }

    // Need at least some ingredients to be a valid recipe
    if (ingredientGroups.length === 0 || ingredientGroups.every((g) => g.items.length === 0)) {
      return null;
    }

    // Parse the ingredient lines we found
    const ingredients = parseIngredientsWithGroups([], ingredientGroups.length ? ingredientGroups : null);

    // Re-parse using our existing group machinery
    const parsedIngredients = [];
    let position = 0;
    for (const group of ingredientGroups) {
      for (const line of group.items) {
        const parsed = parseIngredientLine(decodeHtmlEntities(line), position++);
        parsedIngredients.push({ ...parsed, group: group.name });
      }
    }

    const instructions = instructionTexts.map((text) => ({
      text: decodeHtmlEntities(stripDualUnitAlt(text)),
      image: null,
    }));

    const domPhotos = extractDomImages($, sourceUrl);
    const photoUrl = domPhotos[0] || null;
    const photos = [...new Set(domPhotos)];

    return {
      title: decodeHtmlEntities(title),
      sourceUrl,
      photoUrl,
      photos,
      baseServings: servings || 4,
      prepTimeMinutes: null,
      cookTimeMinutes: null,
      instructions,
      ingredients: parsedIngredients,
    };
  } catch {
    return null;
  }
}

// Best-effort scan of the actual page HTML for additional recipe photos beyond
// what's in the structured JSON-LD data. Prefers specific known recipe-plugin
// containers (WP Recipe Maker, Tasty Recipes, etc.) since those are scoped to
// just the recipe card. Falls back to a broad "[class*=recipe]" match only if
// none of those exist — that broad match often catches the WHOLE blog post
// (author bio, site logo, related posts), which is why logos/author photos
// were leaking into the gallery before this fix.
const SPECIFIC_RECIPE_CONTAINERS = [
  ".wprm-recipe-container", // WP Recipe Maker
  ".tasty-recipes", // Tasty Recipes
  ".tasty-recipe", // Tasty Recipes (older)
  ".recipe-card-container", // Recipe Card Blocks
  ".easyrecipe", // EasyRecipe
  ".mv-create-card", // Mediavine Create
  '[class*="recipe-card" i]',
];

const NOISE_PATTERN =
  /(logo|icon|avatar|sprite|pixel|badge|share|social|advert|gravatar|blank|spacer|placeholder|author|headshot|profile|byline|comment|nav|widget|sidebar|footer|menu|-\d{2,3}x\d{2,3}\.(?:png|jpe?g|gif|webp))/i;

function extractDomImages($, baseUrl) {
  try {
    let scope = null;
    for (const selector of SPECIFIC_RECIPE_CONTAINERS) {
      const found = $(selector);
      if (found.length) {
        scope = found;
        break;
      }
    }
    // Only fall back to the broad match if no specific plugin container was
    // found — this broad selector risks catching the whole article, not just
    // the recipe card, so it's a last resort rather than the default.
    if (!scope) {
      const broad = $('[class*="recipe" i], [id*="recipe" i]');
      scope = broad.length ? broad : $("body");
    }

    const urls = [];
    scope.find("img").each((_, el) => {
      const $el = $(el);
      const candidate = [
        $el.attr("src"),
        $el.attr("data-src"),
        $el.attr("data-lazy-src"),
        $el.attr("data-original"),
      ].find((v) => v && !v.startsWith("data:"));

      if (!candidate || NOISE_PATTERN.test(candidate)) return;

      try {
        urls.push(new URL(candidate, baseUrl).href);
      } catch {
        // malformed URL — skip it
      }
    });

    return [...new Set(urls)].slice(0, 12);
  } catch {
    // Any unexpected DOM shape shouldn't break the import — just skip this bonus step.
    return [];
  }
}

// Best-effort DOM scan for ingredient section headers when the structured
// JSON-LD data doesn't carry them (common — many recipe plugins only put
// headers in the visual markup, not in the schema.org export). Tries known
// plugin patterns for grouped ingredients; returns null if nothing matches
// so the caller keeps the flat JSON-LD list instead.
//
// For WP Recipe Maker (littlespicejar.com and many others), the DOM actually
// has quantity/unit/name split into separate spans — we extract those directly
// and return structured ingredient objects instead of raw text lines, so our
// text parser doesn't have to re-parse merged strings like "¼ cup honey".
function extractIngredientGroupsFromDom($) {
  try {
    // WP Recipe Maker — check for its quantity/unit/name spans first
    const wprmGroups = $(".wprm-recipe-ingredient-group");
    if (wprmGroups.length) {
      const groups = [];
      let hasGroupNames = false;

      wprmGroups.each((_, el) => {
        const $el = $(el);
        const groupName = $el.find(".wprm-recipe-ingredient-group-name").first().text().trim() || null;
        if (groupName) hasGroupNames = true;

        const items = [];
        $el.find(".wprm-recipe-ingredient").each((_, li) => {
          const $li = $(li);

          // If WPRM structured spans exist, use them directly — no re-parsing needed
          const amountText = $li.find(".wprm-recipe-ingredient-amount").first().text().trim();
          const unitText = $li.find(".wprm-recipe-ingredient-unit").first().text().trim();
          const nameText = $li.find(".wprm-recipe-ingredient-name").first().text().trim();
          const notesText = $li.find(".wprm-recipe-ingredient-notes").first().text().trim();

          if (nameText) {
            items.push({
              structured: true,
              name: nameText + (notesText ? ` (${notesText})` : ""),
              amountText,
              unitText,
            });
          } else {
            // Fallback: no structured spans — use the whole line text
            items.push($li.text().replace(/\s+/g, " ").trim());
          }
        });

        if (items.length) groups.push({ name: groupName, items });
      });

      // Return if we found groups with actual section names, or if all items
      // are structured (even without group names — better than re-parsing merged strings)
      const allStructured = groups.every((g) => g.items.every((i) => i?.structured));
      if (hasGroupNames || allStructured) return groups;
    }

    // Generic pattern: a heading (h2/h3/h4/strong) followed by a <ul>/<ol> of
    // items, repeated, inside a container whose class mentions "ingredient".
    const container = $('[class*="ingredient" i]').first();
    if (container.length) {
      const groups = [];
      let currentName = null;
      let currentItems = [];
      container.find("h2, h3, h4, h5, strong, li").each((_, el) => {
        const $el = $(el);
        const tag = el.tagName?.toLowerCase();
        if (tag === "li") {
          const text = $el.text().replace(/\s+/g, " ").trim();
          if (text) currentItems.push(text);
        } else {
          if (currentItems.length) {
            groups.push({ name: currentName, items: currentItems });
            currentItems = [];
          }
          currentName = $el.text().trim();
        }
      });
      if (currentItems.length) groups.push({ name: currentName, items: currentItems });
      if (groups.length > 1 && groups.some((g) => g.name)) return groups;
    }

    return null;
  } catch {
    return null;
  }
}

function findRecipeNode(jsonBlocks) {
  for (const block of jsonBlocks) {
    let parsed;
    try {
      parsed = JSON.parse(block);
    } catch {
      continue;
    }

    const candidates = flattenToArray(parsed);
    for (const node of candidates) {
      const types = Array.isArray(node?.["@type"])
        ? node["@type"]
        : [node?.["@type"]];
      if (types.includes("Recipe")) {
        return node;
      }
    }
  }
  return null;
}

// JSON-LD can be a single object, an array, or wrapped in an @graph array.
function flattenToArray(parsed) {
  if (Array.isArray(parsed)) return parsed.flatMap(flattenToArray);
  if (parsed && Array.isArray(parsed["@graph"])) {
    return parsed["@graph"].flatMap(flattenToArray);
  }
  return [parsed];
}

// Some sites structure ingredients into labeled sections — "For the pickled
// vegetables:", "For the sauce:" — which schema.org has no dedicated field
// for, so sites just put the header as a plain string in the ingredient list.
// Detect and strip those instead of parsing them as a bogus ingredient line.
function isGroupHeader(text) {
  const t = text.trim();
  if (t.length > 60) return false; // too long to plausibly be a header
  if (/^for\s+the\s+/i.test(t)) return true;
  if (t.endsWith(":") && !/\d/.test(t)) return true; // "Sauce:" but not "2 tbsp:"
  return false;
}

function parseIngredientsWithGroups(rawLines, domGroups) {
  const hasJsonLdHeaders = rawLines.some((line) => isGroupHeader(decodeHtmlEntities(line)));

  if (!hasJsonLdHeaders && domGroups && domGroups.length) {
    let position = 0;
    const ingredients = [];
    for (const group of domGroups) {
      for (const item of group.items) {
        if (item?.structured) {
          // Pre-split by the DOM scanner — convert directly, no text-parser needed
          const quantity = item.amountText ? parseFraction(decodeHtmlEntities(item.amountText)) : null;
          const unitNorm = item.unitText
            ? UNIT_ALIASES[item.unitText.toLowerCase().replace(/\.$/, "")] ||
              item.unitText.toLowerCase() || null
            : null;
          ingredients.push({
            name: capitalizeFirst(decodeHtmlEntities(item.name).trim()),
            quantity,
            unit: unitNorm || null,
            group: group.name || null,
            position: position++,
          });
        } else {
          // Plain text line — run through the normal parser
          const parsed = parseIngredientLine(decodeHtmlEntities(String(item)), position++);
          ingredients.push({ ...parsed, group: group.name || null });
        }
      }
    }
    return ingredients;
  }

  let currentGroup = null;
  let position = 0;
  const ingredients = [];

  for (const rawLine of rawLines) {
    const decoded = decodeHtmlEntities(rawLine);
    if (isGroupHeader(decoded)) {
      currentGroup = decoded.replace(/:$/, "").trim();
      continue;
    }
    const parsed = parseIngredientLine(decoded, position++);
    ingredients.push({ ...parsed, group: currentGroup });
  }

  return ingredients;
}

function normalizeRecipe(node, sourceUrl, domPhotos = [], domGroups = null, domStepImages = []) {
  const title = decodeHtmlEntities(node.name?.trim()) || "Untitled Recipe";

  const mainPhotos = extractAllImages(node.image);
  const photoUrl = mainPhotos[0] || null;

  const ingredients = parseIngredientsWithGroups(
    node.recipeIngredient || node.ingredients || [],
    domGroups
  );

  const rawInstructions = extractInstructions(node.recipeInstructions);
  // Only trust the DOM step-image scan when it found exactly as many images
  // (including nulls for steps with no photo) as there are JSON-LD steps —
  // otherwise the two lists could be for different things entirely (e.g. the
  // DOM scan picked up a "related recipes" list) and pairing them by index
  // would attach the wrong photo to the wrong step.
  const stepImagesAligned =
    domStepImages.length === rawInstructions.length ? domStepImages : [];

  const instructions = rawInstructions.map((step, i) => ({
    text: decodeHtmlEntities(step.text),
    image: step.image || stepImagesAligned[i] || null,
  }));

  // Combine structured-data photos (highest confidence), per-step photos, and
  // the best-effort DOM scan — in that order, deduped.
  const stepPhotos = instructions.map((s) => s.image).filter(Boolean);
  const photos = [...new Set([...mainPhotos, ...stepPhotos, ...domPhotos])];

  const baseServings = extractServings(node.recipeYield) ?? 4;

  return {
    title,
    sourceUrl,
    photoUrl,
    photos,
    baseServings,
    prepTimeMinutes: parseIsoDuration(node.prepTime),
    cookTimeMinutes: parseIsoDuration(node.cookTime),
    instructions,
    ingredients,
  };
}

// Best-effort DOM scan for a photo attached to each individual instruction
// step — schema.org JSON-LD often omits per-step images even when the page
// visually shows one next to each step (WP Recipe Maker and similar plugins
// render them in the DOM but don't always include them in the structured
// data export). Returns one entry per step found IN DOM ORDER (null for a
// step with no image), so the caller can zip it against the JSON-LD step
// list positionally — but only when the counts match; see normalizeRecipe.
function extractStepImagesFromDom($, baseUrl) {
  try {
    let $steps = $(".wprm-recipe-instruction-group .wprm-recipe-instruction");
    if (!$steps.length) {
      const container = $('[class*="instruction" i], [class*="direction" i]').first();
      if (container.length) $steps = container.find("li");
    }
    if (!$steps.length) return [];

    const images = [];
    $steps.each((_, el) => {
      const $img = $(el).find("img").first();
      const candidate = [
        $img.attr("src"),
        $img.attr("data-src"),
        $img.attr("data-lazy-src"),
        $img.attr("data-original"),
      ].find((v) => v && !v.startsWith("data:"));

      if (!candidate || NOISE_PATTERN.test(candidate)) {
        images.push(null);
        return;
      }
      try {
        images.push(new URL(candidate, baseUrl).href);
      } catch {
        images.push(null);
      }
    });
    return images;
  } catch {
    // Any unexpected DOM shape shouldn't break the import — just skip this bonus step.
    return [];
  }
}

// Some sites' JSON-LD is generated by a template that HTML-escapes text even
// inside <script type="application/ld+json"> — so JSON.parse gives us back a
// literal "&amp;" instead of "&". Decode the common entities here.
const NAMED_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodeHtmlEntities(str) {
  if (!str) return str;
  return str.replace(/&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity) => {
    if (entity[0] === "#") {
      const isHex = entity[1] === "x" || entity[1] === "X";
      const code = isHex ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isNaN(code) ? match : String.fromCodePoint(code);
    }
    return NAMED_ENTITIES[entity] !== undefined ? NAMED_ENTITIES[entity] : match;
  });
}

function extractImage(image) {
  if (!image) return null;
  if (typeof image === "string") return image;
  if (Array.isArray(image)) return extractImage(image[0]);
  if (typeof image === "object") return image.url || null;
  return null;
}

// Recipe pages often list several image sizes/crops for the same photo, or
// multiple distinct photos (hero shot, step shots, finished-dish shot).
// Collect them all, deduped, for the gallery.
function extractAllImages(image) {
  if (!image) return [];
  const urls = [];
  const collect = (val) => {
    if (!val) return;
    if (typeof val === "string") urls.push(val);
    else if (Array.isArray(val)) val.forEach(collect);
    else if (typeof val === "object" && val.url) urls.push(val.url);
  };
  collect(image);
  return [...new Set(urls)];
}

function extractInstructions(raw) {
  if (!raw) return [];
  if (typeof raw === "string") {
    // Some sites just dump a single string; split on newlines/periods-ish.
    return raw
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((text) => ({ text, image: null }));
  }
  if (Array.isArray(raw)) {
    return raw.flatMap((step) => {
      if (typeof step === "string") return [{ text: step, image: null }];
      if (step["@type"] === "HowToSection" && Array.isArray(step.itemListElement)) {
        return extractInstructions(step.itemListElement);
      }
      if (!step.text) return [];
      return [{ text: step.text.trim(), image: extractImage(step.image) }];
    });
  }
  return [];
}

function extractServings(recipeYield) {
  if (!recipeYield) return null;
  const value = Array.isArray(recipeYield) ? recipeYield[0] : recipeYield;
  const match = String(value).match(/\d+/);
  return match ? parseInt(match[0], 10) : null;
}

// Parses ISO 8601 durations like "PT30M" or "PT1H15M" into minutes.
function parseIsoDuration(iso) {
  if (!iso) return null;
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?/.exec(iso);
  if (!match) return null;
  const hours = parseInt(match[1] || "0", 10);
  const minutes = parseInt(match[2] || "0", 10);
  return hours * 60 + minutes || null;
}

// Splits a raw ingredient line like "2 1/2 cups flour" into quantity/unit/name.
// This is a best-effort parser -- users can correct it after import.
const UNIT_WORDS = [
  "cup", "cups", "tbsp", "tbsps", "tablespoon", "tablespoons", "tsp", "tsps", "teaspoon", "teaspoons",
  "g", "gram", "grams", "kg", "kilogram", "kilograms", "oz", "ounce", "ounces", "lb", "lbs", "pound", "pounds",
  "ml", "milliliter", "milliliters", "l", "liter", "liters", "pinch", "pinches",
  "clove", "cloves", "can", "cans", "slice", "slices",
];

// Canonical short form for each recognized unit — several ways of writing the
// same unit ("tablespoon", "tablespoons", "tbsp") must normalize to ONE stored
// value, or the same ingredient from two recipes won't merge on the grocery list.
const UNIT_ALIASES = {
  cup: "cup", cups: "cup",
  tbsp: "tbsp", tbsps: "tbsp", tablespoon: "tbsp", tablespoons: "tbsp",
  tsp: "tsp", tsps: "tsp", teaspoon: "tsp", teaspoons: "tsp",
  g: "g", gram: "g", grams: "g",
  kg: "kg", kilogram: "kg", kilograms: "kg",
  oz: "oz", ounce: "oz", ounces: "oz",
  lb: "lb", lbs: "lb", pound: "lb", pounds: "lb",
  ml: "ml", milliliter: "ml", milliliters: "ml",
  l: "l", liter: "l", liters: "l",
  pinch: "pinch", pinches: "pinch",
  clove: "clove", cloves: "clove",
  can: "can", cans: "can",
  slice: "slice", slices: "slice",
};

// Recipe sites commonly use unicode fraction characters ("¼ cup") instead of
// "1/4 cup" — these need their own character class or the leading-quantity
// regex below silently fails to match and the whole line falls through as
// unparsed text (name = raw line, quantity = null).
const VULGAR_FRACTIONS = "¼½¾⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞";
const QTY_CHARS = `[\\d\\s\\/.\\-–${VULGAR_FRACTIONS}]`;

// Vice/Munchies (and a few other sites) write dual-unit ingredients and
// quantities as "1 pound|450 grams chicken breasts" or, mid-sentence in a
// direction, "1 cup|250 ml cold water" — a "|" separating the US and metric
// measurement for the same amount. parseIngredientLine's regex expects one
// quantity+unit pair right before the text, so the "|" broke it completely:
// no whitespace ever followed the unit, so the match backtracked all the way
// down to capturing nothing, and the ENTIRE line (unit included) fell
// through into the name field unparsed. Strip the redundant metric echo
// before it ever reaches the parser — used for both ingredient lines and
// instruction text.
function stripDualUnitAlt(line) {
  return line.replace(
    new RegExp(`\\s*\\|\\s*${QTY_CHARS}+\\s*(?:${UNIT_WORDS.join("|")})\\b\\.?`, "gi"),
    ""
  );
}

// Some recipes prefix a quantity with an informal qualifier ("scant 2
// teaspoons", "brimming 2 tablespoons", "a heaping 1/4 cup") instead of
// leading straight with the number. The main regex below expects the
// quantity first, so a leading qualifier word made it fail exactly like the
// dual-unit "|" case — the whole line (unit included) fell through into the
// name, quantity lost entirely. Strip it before parsing; the qualifier
// itself is minor cooking color, not worth preserving at the cost of losing
// the actual quantity.
function stripQuantityQualifier(line) {
  return line.replace(/^(?:a\s+)?(scant|brimming|heaping|generous|rounded)\s+/i, "");
}

function parseIngredientLine(line, position) {
  const text = stripQuantityQualifier(stripDualUnitAlt(String(line).trim()));

  const match = text.match(new RegExp(`^(${QTY_CHARS}+)?\\s*([a-zA-Z]+\\.?)?\\s+(.*)$`));

  if (!match) {
    return {
      name: capitalizeFirst(stripStrayParens(text).replace(/[,.\-–\s]+$/, "").trim()),
      quantity: null,
      unit: null,
      position,
    };
  }

  const [, qtyRaw, unitRaw, rest] = match;
  const quantity = qtyRaw ? parseFraction(qtyRaw.trim()) : null;
  // Strip a trailing period before comparing so "lb." matches the "lb" entry
  // in UNIT_WORDS — without this, "1 lb. raw shrimp" failed to split at all
  // because the mandatory whitespace after the unit could never align.
  const unitNormalized = unitRaw?.replace(/\.$/, "").toLowerCase();
  const isKnownUnit = unitNormalized && UNIT_WORDS.includes(unitNormalized);

  let name = isKnownUnit ? rest.trim() : [unitRaw, rest].filter(Boolean).join(" ").trim();

  // "a pinch of salt" — once "pinch" is recognized as the unit, the leftover
  // "of salt" still has a dangling connector word. Strip it.
  name = name.replace(/^of\s+/i, "");

  // Strip a trailing "(30 mL)"/"(60 g)"-style parenthetical that just restates
  // the quantity in another unit — that info now lives in quantity/unit, so
  // leaving it in the name would duplicate it. Prep notes like "(cubed)" or
  // "(peeled and shredded)" don't match this pattern and are left alone.
  name = name.replace(
    new RegExp(`\\s*\\(\\s*${QTY_CHARS}+\\s*(?:${UNIT_WORDS.join("|")})\\.?\\s*\\)\\s*$`, "i"),
    ""
  );

  // Defensive cleanup: some sites' markup produces a stray unmatched "(" or
  // ")", or a dangling trailing comma, in the ingredient text.
  name = stripStrayParens(name);
  name = name.replace(/[,.\-–\s]+$/, "").trim();

  return {
    name: capitalizeFirst(name.trim()),
    quantity,
    unit: isKnownUnit ? UNIT_ALIASES[unitNormalized] : null,
    position,
  };
}

// Removes an unmatched trailing ")" or leading "(" left over from odd source
// markup (e.g. "Cucumber )" instead of "Cucumber (sliced)").
function stripStrayParens(str) {
  let result = str;
  const countOpen = () => (result.match(/\(/g) || []).length;
  const countClose = () => (result.match(/\)/g) || []).length;

  while (result.trimEnd().endsWith(")") && countClose() > countOpen()) {
    result = result.trimEnd().slice(0, -1).trimEnd();
  }
  while (result.trimStart().startsWith("(") && countOpen() > countClose()) {
    result = result.trimStart().slice(1).trimStart();
  }
  return result;
}

function capitalizeFirst(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

const VULGAR_FRACTION_VALUES = {
  "¼": 0.25, "½": 0.5, "¾": 0.75,
  "⅓": 1 / 3, "⅔": 2 / 3,
  "⅕": 0.2, "⅖": 0.4, "⅗": 0.6, "⅘": 0.8,
  "⅙": 1 / 6, "⅚": 5 / 6,
  "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875,
};

function parseFraction(rawStr) {
  // handles "2", "2.5", "1/2", "2 1/2", "¼", "1¼"
  let str = rawStr;
  let total = 0;
  let found = false;

  for (const [char, value] of Object.entries(VULGAR_FRACTION_VALUES)) {
    if (str.includes(char)) {
      total += value;
      found = true;
      str = str.replace(char, " ");
    }
  }

  const parts = str.split(/\s+/).filter(Boolean);
  for (const part of parts) {
    if (part.includes("/")) {
      const [num, den] = part.split("/").map(Number);
      if (den) {
        total += num / den;
        found = true;
      }
    } else {
      const n = parseFloat(part);
      if (!Number.isNaN(n)) {
        total += n;
        found = true;
      }
    }
  }
  return found ? total : null;
}
