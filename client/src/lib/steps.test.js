import { describe, expect, it } from "vitest";
import { stepIsHeading, stepTitle, stepBody, stepTimer, scaleStepText, stepIngredients } from "./steps.js";

describe("stepIsHeading / stepTitle", () => {
  it("treats a bare label as a heading, not a title", () => {
    expect(stepIsHeading("Make the Sauce:")).toBe(true);
    expect(stepTitle("Make the Sauce:")).toBeNull();
  });

  it("treats a labeled instruction as a titled step, not a heading", () => {
    expect(stepIsHeading("Prep: Chop the onions and mince the garlic.")).toBe(false);
    expect(stepTitle("Prep: Chop the onions and mince the garlic.")).toBe("Prep");
  });

  it("leaves an untitled step alone", () => {
    expect(stepTitle("Preheat the oven to 400F.")).toBeNull();
  });

  it("strips the title prefix in stepBody but leaves untitled text untouched", () => {
    expect(stepBody("Prep: Chop the onions.")).toBe("Chop the onions.");
    expect(stepBody("Preheat the oven.")).toBe("Preheat the oven.");
  });
});

describe("stepTimer", () => {
  it("detects a minute duration", () => {
    expect(stepTimer("Roast for 20 minutes, flipping halfway.")).toEqual({ seconds: 1200, label: "20-minute" });
  });

  it("detects an hour duration", () => {
    expect(stepTimer("Let it rest for 1 hour.")).toEqual({ seconds: 3600, label: "1-hour" });
  });

  it("returns null when no duration is mentioned", () => {
    expect(stepTimer("Season with salt and pepper.")).toBeNull();
    expect(stepTimer("Simmer for 90 minutes.").label).toBe("1 h 30 min");
    expect(stepTimer("Rest 3 min.").label).toBe("3-minute");
  });
});

describe("scaleStepText", () => {
  it("scales a plain count up", () => {
    expect(scaleStepText("Add 2 eggs and whisk.", 2)).toBe("Add 4 eggs and whisk.");
  });

  it("scales a fraction", () => {
    expect(scaleStepText("Stir in 1/2 cup of stock.", 2)).toBe("Stir in 1 cup of stock.");
  });

  it("returns the body unscaled at 1x", () => {
    expect(scaleStepText("Add 2 eggs.", 1)).toBe("Add 2 eggs.");
  });

  it("leaves a temperature alone", () => {
    expect(scaleStepText("Bake at 350°F for 20 minutes.", 2)).toBe("Bake at 350°F for 20 minutes.");
  });

  it("leaves a percentage alone", () => {
    expect(scaleStepText("Use 2% milk.", 3)).toBe("Use 2% milk.");
  });

  it("leaves a duration alone (doubling servings doesn't double cook time)", () => {
    expect(scaleStepText("Roast for 20 minutes, flipping halfway.", 2)).toBe(
      "Roast for 20 minutes, flipping halfway."
    );
    expect(scaleStepText("Let it rest for 1 hour.", 3)).toBe("Let it rest for 1 hour.");
  });

  it("scales a step's body, not its title prefix", () => {
    expect(scaleStepText("Prep: Chop 2 onions.", 2)).toBe("Chop 4 onions.");
  });
});

describe("stepIngredients", () => {
  const ingredients = [{ name: "chickpeas" }, { name: "olive oil" }, { name: "salt" }];

  it("matches ingredients mentioned in the step text", () => {
    expect(stepIngredients("Toss the chickpeas in olive oil.", ingredients)).toEqual([
      { name: "chickpeas" },
      { name: "olive oil" },
    ]);
  });

  it("skips ingredients not mentioned", () => {
    expect(stepIngredients("Preheat the oven to 400F.", ingredients)).toEqual([]);
  });

  it("skips short/generic words that would over-match (e.g. 'salt')", () => {
    // "salt" is 4 letters, right at the >3-letter cutoff, but shouldn't
    // match unless it's actually in the step text.
    expect(stepIngredients("Roast until golden.", ingredients)).toEqual([]);
  });

  it("matches the step's body, not its title prefix", () => {
    expect(stepIngredients("Prep: Toss the chickpeas.", ingredients)).toEqual([{ name: "chickpeas" }]);
  });
});
