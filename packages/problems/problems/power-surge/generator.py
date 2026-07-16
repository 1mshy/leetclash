"""Seeded input generator for power-surge.

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
    k = rng.randint(1, n)
    a = []
    for _ in range(n):
        roll = rng.random()
        if roll < 0.92:
            a.append(rng.randint(-9, 9))
        elif roll < 0.98:
            a.append(rng.randint(-9_999, 9_999))
        else:
            a.append(rng.randint(-1_000_000_000, 1_000_000_000))
    # Plant a positive hot streak so the best window is not just noise.
    start = rng.randrange(n)
    for i in range(start, min(n, start + k)):
        a[i] = abs(a[i])

    out = [f"{n} {k}", " ".join(map(str, a))]
    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
