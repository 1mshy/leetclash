"""Seeded input generator for token-fare.

Usage: python3 generator.py <seed> <size_tier>
size_tier: small | medium | large
Prints a valid input to stdout. Deterministic per (seed, tier).
"""
import random
import sys

TIERS = {
    "small": (1, 4, 50),
    "medium": (2, 8, 5_000),
    "large": (8, 12, 100_000),
}


def main() -> None:
    seed = int(sys.argv[1])
    tier = sys.argv[2]
    lo_k, hi_k, max_f = TIERS[tier]
    rng = random.Random((seed, tier).__repr__())

    k = rng.randint(lo_k, hi_k)
    hi_d = min(100_000, max(2, max_f))
    dens = set()
    if k >= 2:
        # Plant x alongside 2x-1: largest-first greedy mishandles fares like 2x.
        x = rng.randint(2, max(2, hi_d // 2))
        dens.add(x)
        dens.add(min(100_000, 2 * x - 1))
    while len(dens) < k:
        dens.add(rng.randint(1, hi_d))
    dens = sorted(dens)
    rng.shuffle(dens)

    if rng.random() < 0.5:
        f = rng.randint(0, max_f)
    else:
        # Walk up using real tokens so the fare is guaranteed payable.
        f = 0
        while True:
            step = rng.choice(dens)
            if f + step > max_f or rng.random() < 0.02:
                break
            f += step

    out = [f"{k} {f}", " ".join(map(str, dens))]
    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
