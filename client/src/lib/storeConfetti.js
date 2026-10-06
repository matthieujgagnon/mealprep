// The pieces of the celebration when the last item in Store mode is checked
// (design: docs/design/riso-v2-store-mode): 240 pieces falling from the top,
// 150 shot up from the two bottom corners, and 22 sparkles. Random each time it
// starts; `rand` is only there so a test can fix it.

const COLORS = ["#FF48B0", "#2323FF", "#FFE14D", "#10C95C", "#F4F1EA", "#FF8A3D", "#7B5CFF"];

export function makeConfetti(rand = Math.random) {
  const between = (a, b) => a + rand() * (b - a);
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const pieces = [];

  for (let i = 0; i < 240; i++) {
    const w = between(5, 14);
    const shape = rand();
    pieces.push({
      anim: "sm-fall",
      top: `${between(-30, 0).toFixed(0)}px`,
      left: `${between(0, 98).toFixed(1)}%`,
      w: `${w.toFixed(0)}px`,
      h: `${(shape < 0.3 ? w : between(8, 22)).toFixed(0)}px`,
      bg: pick(COLORS),
      radius: shape < 0.3 ? "50%" : shape < 0.4 ? "8px" : "2px",
      duration: `${between(1.6, 4.2).toFixed(2)}s`,
      delay: `${between(0, 2).toFixed(2)}s`,
    });
  }

  for (let i = 0; i < 150; i++) {
    const fromLeft = rand() < 0.5;
    const arc = pick(["", "2", "3"]);
    const w = between(6, 13);
    const shape = rand();
    const offset = `${between(0, 70).toFixed(0)}px`;
    pieces.push({
      anim: `sm-${fromLeft ? "bl" : "br"}${arc}`,
      bottom: `${between(-24, -4).toFixed(0)}px`,
      left: fromLeft ? offset : undefined,
      right: fromLeft ? undefined : offset,
      w: `${w.toFixed(0)}px`,
      h: `${(shape < 0.3 ? w : between(9, 20)).toFixed(0)}px`,
      bg: pick(COLORS),
      radius: shape < 0.3 ? "50%" : "2px",
      duration: `${between(1.5, 3.2).toFixed(2)}s`,
      delay: `${between(0.05, 1.8).toFixed(2)}s`,
    });
  }

  const sparkles = Array.from({ length: 22 }, () => ({
    left: `${between(2, 92).toFixed(0)}%`,
    top: `${between(2, 85).toFixed(0)}%`,
    size: `${between(12, 32).toFixed(0)}px`,
    color: rand() < 0.5 ? "#FFE14D" : "#F4F1EA",
    delay: `${between(0, 2).toFixed(2)}s`,
  }));

  return { pieces, sparkles };
}
