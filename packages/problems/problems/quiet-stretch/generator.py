"""Seeded input generator for quiet-stretch.

Usage: python3 generator.py <seed> <size_tier>
size_tier: small | medium | large
Prints a valid input to stdout. Deterministic per (seed, tier).
"""
import random
import sys

TIERS = {
    "small": (1, 15, 12),
    "medium": (50, 500, 10_000),
    "large": (50_000, 200_000, 1_000_000_000),
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
        if roll < 0.15:
            a.append(0)  # runs of zeros stress "extend for free" logic
        elif roll < 0.3:
            a.append(mag)  # spikes that force window resets
        else:
            a.append(rng.randint(0, mag))

    # Pick S so answers vary: sometimes tiny, sometimes ~a random window sum.
    mode = rng.random()
    if mode < 0.2:
        s = rng.randint(0, mag - 1) if mag > 1 else 0
    else:
        i = rng.randrange(n)
        j = rng.randint(i, min(n - 1, i + max(1, n // 4)))
        s = sum(a[i:j + 1])

    out = [f"{n} {s}", " ".join(map(str, a))]
    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
