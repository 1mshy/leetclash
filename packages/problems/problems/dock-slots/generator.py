"""Seeded input generator for dock-slots.

Usage: python3 generator.py <seed> <size_tier>
size_tier: small | medium | large
Prints a valid input to stdout. Deterministic per (seed, tier).
"""
import random
import sys

TIERS = {
    "small": (1, 12, 30),
    "medium": (50, 500, 5_000),
    "large": (100_000, 200_000, 99),
}


def main() -> None:
    seed = int(sys.argv[1])
    tier = sys.argv[2]
    lo_n, hi_n, horizon = TIERS[tier]
    rng = random.Random((seed, tier).__repr__())

    n = rng.randint(lo_n, hi_n)
    lines = [str(n)]
    for _ in range(n):
        s = rng.randint(0, horizon - 1)
        roll = rng.random()
        if roll < 0.55:
            e = min(horizon, s + rng.randint(1, 3))  # short slots
        elif roll < 0.85:
            e = min(horizon, s + rng.randint(1, max(2, horizon // 8)))
        else:
            e = rng.randint(s + 1, horizon)  # long blockers punish start-sorting
        lines.append(f"{s} {e}")

    sys.stdout.write("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
