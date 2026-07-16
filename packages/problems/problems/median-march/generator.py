"""Seeded input generator for median-march.

Usage: python3 generator.py <seed> <size_tier>
size_tier: small | medium | large
Prints a valid input to stdout. Deterministic per (seed, tier).
"""
import random
import sys

TIERS = {
    "small": (1, 12),
    "medium": (50, 500),
    "large": (100_000, 200_000),
}


def main() -> None:
    seed = int(sys.argv[1])
    tier = sys.argv[2]
    lo_n, hi_n = TIERS[tier]
    rng = random.Random((seed, tier).__repr__())

    n = rng.randint(lo_n, hi_n)
    base = rng.randint(0, 500)
    a = []
    for _ in range(n):
        roll = rng.random()
        if roll < 0.90:
            # Dense main camp: skews the median away from the mean.
            a.append(base + rng.randint(0, 99))
        elif roll < 0.97:
            a.append(rng.randint(0, 99_999))
        else:
            # Far outliers pull the arithmetic mean off the optimum.
            a.append(rng.randint(900_000_000, 1_000_000_000))
    rng.shuffle(a)

    out = [str(n), " ".join(map(str, a))]
    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
