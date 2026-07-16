"""Seeded input generator for rumor-circles.

Usage: python3 generator.py <seed> <size_tier>
size_tier: small | medium | large
Prints a valid input to stdout. Deterministic per (seed, tier).
"""
import random
import sys

TIERS = {
    "small": (1, 12, 16),
    "medium": (50, 500, 700),
    "large": (100_000, 200_000, 38_000),
}


def main() -> None:
    seed = int(sys.argv[1])
    tier = sys.argv[2]
    lo_n, hi_n, hi_m = TIERS[tier]
    rng = random.Random((seed, tier).__repr__())

    n = rng.randint(lo_n, hi_n)
    m = rng.randint(0, hi_m) if n > 1 else 0

    # Partition the workers into contiguous blocks; edges stay inside a block,
    # so the component count is driven by blocks, loops and duplicates.
    num_blocks = min(n, rng.randint(2, 40)) if n > 1 else 1
    cuts = sorted(rng.sample(range(1, n), num_blocks - 1)) if num_blocks > 1 else []
    bounds = [0] + cuts + [n]
    blocks = [(bounds[i] + 1, bounds[i + 1]) for i in range(len(bounds) - 1)]
    eligible = [b for b in blocks if b[1] > b[0]]  # blocks with >= 2 workers

    edges = []
    if eligible:
        for _ in range(m):
            if edges and rng.random() < 0.15:
                edges.append(rng.choice(edges))  # duplicate roster entries
            else:
                lo, hi = rng.choice(eligible)
                u = rng.randint(lo, hi)
                v = rng.randint(lo, hi)
                while v == u:
                    v = rng.randint(lo, hi)
                if rng.random() < 0.5:
                    u, v = v, u
                edges.append((u, v))
    m = len(edges)

    out = [f"{n} {m}"] + [f"{u} {v}" for u, v in edges]
    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
