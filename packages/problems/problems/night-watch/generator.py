"""Seeded input generator for night-watch.

Usage: python3 generator.py <seed> <size_tier>
size_tier: small | medium | large
Prints a valid input to stdout. Deterministic per (seed, tier).
"""
import random
import sys

TIERS = {
    "small": (1, 12, 50),
    "medium": (50, 500, 100_000),
    "large": (150_000, 200_000, 1_000_000_000),
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
        if roll < 0.03:
            # Rare jackpot chests: taking one must beat long runs of small ones.
            a.append(rng.randint(mag // 2, mag))
        elif roll < 0.18:
            a.append(0)  # worthless chests break parity-based heuristics
        else:
            a.append(rng.randint(0, min(mag, 99)))

    out = [str(n), " ".join(map(str, a))]
    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
