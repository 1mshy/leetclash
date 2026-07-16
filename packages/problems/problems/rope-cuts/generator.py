"""Seeded input generator for rope-cuts.

Usage: python3 generator.py <seed> <size_tier>
size_tier: small | medium | large
Prints a valid input to stdout. Deterministic per (seed, tier).
"""
import random
import sys

TIERS = {
    "small": (1, 12, 20),
    "medium": (50, 500, 10_000),
    "large": (120_000, 200_000, 999),
}


def main() -> None:
    seed = int(sys.argv[1])
    tier = sys.argv[2]
    lo_n, hi_n, mag = TIERS[tier]
    rng = random.Random((seed, tier).__repr__())

    n = rng.randint(lo_n, hi_n)
    target = rng.randint(2, max(2, mag // 4))
    lens = []
    for _ in range(n):
        roll = rng.random()
        if roll < 0.4:
            # Exact multiples of the planted piece length: zero waste at L = target.
            lens.append(min(mag, target * rng.randint(1, max(1, mag // target))))
        elif roll < 0.6:
            # Just-under multiples: maximum per-rope waste at L = target, which
            # punishes pooled-total shortcuts.
            m = target * rng.randint(1, max(1, mag // target))
            lens.append(max(1, min(mag, m - rng.randint(1, target))))
        else:
            lens.append(rng.randint(1, mag))
    # Pick k near what the planted length can supply so the search is tight.
    cap = sum(x // target for x in lens)
    if cap > 0:
        slack = max(1, cap // 8)
        k = max(1, cap + rng.randint(-slack, slack))
    else:
        k = rng.randint(1, 10)
    k = min(k, 1_000_000_000)

    out = [f"{n} {k}", " ".join(map(str, lens))]
    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
