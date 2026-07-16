"""Seeded input generator for badge-squeeze.

Usage: python3 generator.py <seed> <size_tier>
size_tier: small | medium | large
Prints a valid input to stdout. Deterministic per (seed, tier).
"""
import random
import sys

TIERS = {
    "small": (1, 12),
    "medium": (50, 500),
    "large": (150_000, 200_000),
}

LETTERS = "abcdefghijklmnopqrstuvwxyz"


def main() -> None:
    seed = int(sys.argv[1])
    tier = sys.argv[2]
    lo_n, hi_n = TIERS[tier]
    rng = random.Random((seed, tier).__repr__())

    n = rng.randint(lo_n, hi_n)
    parts = []
    total = 0
    last = ""
    while total < n:
        c = rng.choice(LETTERS)
        if c == last:
            continue  # keep planned runs maximal
        roll = rng.random()
        if roll < 0.5:
            run = 1  # singleton runs make compression a losing trade
        elif roll < 0.8:
            run = rng.randint(2, 4)
        else:
            run = rng.randint(5, 60)  # long runs make compression win
        run = min(run, n - total)
        parts.append(c * run)
        total += run
        last = c

    sys.stdout.write("".join(parts) + "\n")


if __name__ == "__main__":
    main()
