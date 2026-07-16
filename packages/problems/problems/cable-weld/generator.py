"""Seeded input generator for cable-weld.

Usage: python3 generator.py <seed> <size_tier>
size_tier: small | medium | large
Prints a valid input to stdout. Deterministic per (seed, tier).
"""
import random
import sys

TIERS = {
    "small": (1, 12, 50),
    "medium": (50, 500, 100_000),
    "large": (120_000, 200_000, 1_000_000_000),
}


def main() -> None:
    seed = int(sys.argv[1])
    tier = sys.argv[2]
    lo_n, hi_n, mag = TIERS[tier]
    rng = random.Random((seed, tier).__repr__())

    n = rng.randint(lo_n, hi_n)
    a = []
    for _ in range(n):
        roll = rng.random()
        if roll < 0.04:
            # A few heavy segments dominate the tally and stress 64-bit sums.
            a.append(rng.randint(max(1, mag // 10), mag))
        elif roll < 0.4:
            # Lots of tiny segments: merge order matters most down here.
            a.append(rng.randint(1, 9))
        else:
            a.append(rng.randint(1, min(mag, 999)))

    out = [str(n), " ".join(map(str, a))]
    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
