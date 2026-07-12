"""Seeded input generator for pair-sum-count.

Usage: python3 generator.py <seed> <size_tier>
size_tier: small | medium | large
Prints a valid input to stdout. Deterministic per (seed, tier).
"""
import random
import sys

TIERS = {
    "small": (1, 12, 20),
    "medium": (50, 500, 10_000),
    "large": (50_000, 200_000, 1_000_000_000),
}


def main() -> None:
    seed = int(sys.argv[1])
    tier = sys.argv[2]
    lo_n, hi_n, mag = TIERS[tier]
    rng = random.Random((seed, tier).__repr__())

    n = rng.randint(lo_n, hi_n)
    k = rng.randint(-2 * mag, 2 * mag)
    a = []
    for _ in range(n):
        roll = rng.random()
        if roll < 0.35 and a:
            # Plant a complement of an existing element so answers are non-trivial.
            a.append(k - rng.choice(a))
        elif roll < 0.5:
            a.append(k // 2)  # stresses the x + x == k case
        else:
            a.append(rng.randint(-mag, mag))
    # Clamp planted values back into range.
    a = [max(-1_000_000_000, min(1_000_000_000, x)) for x in a]

    out = [f"{n} {k}", " ".join(map(str, a))]
    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
