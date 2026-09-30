import { describe, expect, it } from "vitest";
import { tidyDealTitle } from "./dealTitle.js";

describe("tidyDealTitle", () => {
  it.each([
    ["PC BLACK LABEL SALMON FILLETS", "PC black label salmon fillets"],
    ["Seedless Navel Oranges (3 lb)", "Seedless navel oranges, 3 lb"],
    ["Selection of Block or Grated Cheese (400g)", "Selection of block or grated cheese, 400 g"],
    ["Huile D'Olive Extra Vierge Gallo Ou Mueloliva", "Huile d'olive extra vierge Gallo ou mueloliva"],
    ["Laitues Coeurs De Romaine 3 Unités Québec", "Laitues coeurs de romaine Québec, 3-pack"],
    ["NATREL 2% MILK 2 L", "Natrel 2% milk, 2 L"],
    ["Coca-Cola Soft Drinks 12 x 355 mL", "Coca-Cola soft drinks, 12 × 355 mL"],
    ["MCCAIN SUPERFRIES, 650-750 g, Selected Varieties", "McCain superfries, selected varieties, 650–750 g"],
    ["boneless skinless chicken breasts", "Boneless skinless chicken breasts"],
    ["Mexican Avocados", "Mexican avocados"],
    ["Lean Ground Beef®", "Lean ground beef"],
    ["Pasta, 900g", "Pasta, 900 g"],
    ["Lemons", "Lemons"],
  ])("%s -> %s", (input, expected) => {
    expect(tidyDealTitle(input)).toBe(expected);
  });

  it("keeps words that only look like units", () => {
    expect(tidyDealTitle("Large Lemons")).toBe("Large lemons");
    expect(tidyDealTitle("1 Lemon")).toBe("1 lemon");
  });

  it("returns empty input as is", () => {
    expect(tidyDealTitle("")).toBe("");
    expect(tidyDealTitle(null)).toBe("");
  });
});
