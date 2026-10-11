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

// The finished view's burst after "Back to the app" (design: Cook Mode Finished):
// about 110 pieces in blue, yellow, green, pink and ink that burst out of the
// middle of the screen, then fall and fade over about 2 seconds.
const BURST_COLORS = ["#2323FF", "#FFE14D", "#10C95C", "#FF5FA2", "#16181F"];

export function makeBurst(rand = Math.random) {
  const pieces = [];
  for (let i = 0; i < 110; i++) {
    const w = 6 + rand() * 6;
    const angle = rand() * Math.PI * 2;
    const speed = 120 + rand() * 380;
    const dx = Math.cos(angle) * speed;
    const dy = Math.sin(angle) * speed - 160;
    const rot = (rand() - 0.5) * 900;
    pieces.push({
      anim: "sm-burst",
      top: "42%",
      left: "50%",
      w: `${w.toFixed(0)}px`,
      h: `${(w * 1.6).toFixed(0)}px`,
      bg: BURST_COLORS[i % BURST_COLORS.length],
      radius: i % 3 ? "2px" : "50%",
      duration: `${(2 + rand() * 0.5).toFixed(2)}s`,
      delay: "0s",
      vars: {
        "--dx": `${dx.toFixed(0)}px`,
        "--dy": `${dy.toFixed(0)}px`,
        "--dx2": `${(dx * 1.25).toFixed(0)}px`,
        "--dy2": `${(dy + 700).toFixed(0)}px`,
        "--rot": `${rot.toFixed(0)}deg`,
        "--rot-half": `${(rot / 2).toFixed(0)}deg`,
      },
    });
  }
  return { pieces, sparkles: [] };
}
