"""Seeded input generator for crate-brackets.

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

PAIRS = {"(": ")", "[": "]", "{": "}"}
OPENERS = "([{"
ALL = "()[]{}"


def balanced(rng: random.Random, n: int) -> list[str]:
    """Build a properly nested bracket sequence of even length n."""
    out: list[str] = []
    stack: list[str] = []
    remaining = n
    while remaining > 0:
        must_open = not stack
        must_close = len(stack) == remaining
        if must_close or (not must_open and rng.random() < 0.5):
            out.append(PAIRS[stack.pop()])
        else:
            c = rng.choice(OPENERS)
            stack.append(c)
            out.append(c)
        remaining -= 1
    return out


def main() -> None:
    seed = int(sys.argv[1])
    tier = sys.argv[2]
    lo_n, hi_n = TIERS[tier]
    rng = random.Random((seed, tier).__repr__())

    n = rng.randint(lo_n, hi_n)
    if n % 2 == 1:
        # Odd length can never balance; emit pure noise.
        s = [rng.choice(ALL) for _ in range(n)]
    else:
        # Start from a valid manifest, then sometimes corrupt it so both
        # answers occur and count-based shortcuts stay wrong.
        s = balanced(rng, n)
        roll = rng.random()
        if roll < 0.35:
            i, j = rng.randrange(n), rng.randrange(n)
            s[i], s[j] = s[j], s[i]  # counts stay equal, nesting may break
        elif roll < 0.5:
            s[rng.randrange(n)] = rng.choice(ALL)

    sys.stdout.write(f"{n}\n{''.join(s)}\n")


if __name__ == "__main__":
    main()
