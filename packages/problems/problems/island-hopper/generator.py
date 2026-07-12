"""Seeded input generator for island-hopper.

Usage: python3 generator.py <seed> <size_tier>
size_tier: small | medium | large
Prints a valid input to stdout. Deterministic per (seed, tier).
Guarantees exactly one F and one H; reachability is NOT guaranteed
(unreachable harbors are valid, answer -1).
"""
import random
import sys

TIERS = {
    "small": (2, 8),
    "medium": (10, 60),
    "large": (300, 1000),
}


def main() -> None:
    seed = int(sys.argv[1])
    tier = sys.argv[2]
    lo, hi = TIERS[tier]
    rng = random.Random((seed, tier).__repr__())

    r = rng.randint(lo, hi)
    c = rng.randint(lo, hi)
    water = rng.choice([0.15, 0.3, 0.45])
    grid = [["#" if rng.random() < water else "." for _ in range(c)] for _ in range(r)]

    # Occasionally carve a snaking corridor so long back-tracking paths exist.
    if rng.random() < 0.5:
        i, j = rng.randrange(r), rng.randrange(c)
        for _ in range(r * c // 2):
            grid[i][j] = "."
            di, dj = rng.choice(((1, 0), (-1, 0), (0, 1), (0, -1)))
            i = min(r - 1, max(0, i + di))
            j = min(c - 1, max(0, j + dj))

    cells = [(i, j) for i in range(r) for j in range(c)]
    fi, fj = rng.choice(cells)
    hi_, hj = rng.choice([p for p in cells if p != (fi, fj)])
    grid[fi][fj] = "F"
    grid[hi_][hj] = "H"

    out = [f"{r} {c}"] + ["".join(row) for row in grid]
    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
