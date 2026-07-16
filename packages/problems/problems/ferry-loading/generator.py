"""Seeded input generator for ferry-loading.

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
    lo_n, hi_n, cap = TIERS[tier]
    rng = random.Random((seed, tier).__repr__())

    n = rng.randint(lo_n, hi_n)
    w = rng.randint(2, cap)
    light_hi = min(w, 99) if tier == "large" else max(1, w // 2)
    heavy_p = 0.02 if tier == "large" else 0.4
    ws = []
    for _ in range(n):
        if rng.random() < heavy_p:
            # Heavies hug the cap: they pair with the lightest crates or nobody.
            ws.append(rng.randint(max(1, w - light_hi), w))
        else:
            ws.append(rng.randint(1, light_hi))

    out = [f"{n} {w}", " ".join(map(str, ws))]
    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
