"""Seeded input generator for relay-heights.

Usage: python3 generator.py <seed> <size_tier>
size_tier: small | medium | large
Prints a valid input to stdout. Deterministic per (seed, tier).
"""
import random
import sys

TIERS = {
    "small": (1, 12, 30),
    "medium": (50, 500, 10_000),
    "large": (150_000, 200_000, 1_000_000_000),
}


def main() -> None:
    seed = int(sys.argv[1])
    tier = sys.argv[2]
    lo_n, hi_n, mag = TIERS[tier]
    rng = random.Random((seed, tier).__repr__())

    n = rng.randint(lo_n, hi_n)
    if tier == "large":
        # Sea of single-digit duplicates (poison for non-strict chains) with a
        # planted strictly increasing ladder scattered through it.
        h = [rng.randint(1, 9) for _ in range(n)]
        ladder_len = rng.randint(n // 40, n // 16)
        vals = sorted(rng.sample(range(10, mag), ladder_len))
        for p, v in zip(sorted(rng.sample(range(n), ladder_len)), vals):
            h[p] = v
    else:
        h = []
        for _ in range(n):
            roll = rng.random()
            if roll < 0.3 and h:
                h.append(rng.choice(h))  # duplicates punish non-strict chains
            elif roll < 0.55 and h:
                h.append(min(mag, h[-1] + rng.randint(1, 3)))  # gentle climbs
            else:
                h.append(rng.randint(1, mag))

    out = [str(n), " ".join(map(str, h))]
    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
