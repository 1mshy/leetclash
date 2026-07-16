# Plausibly-wrong solution: always prints the run-length compressed form,
# forgetting the "only if strictly shorter" rule. Ids with mostly singleton
# runs (like "abcd" -> "a1b1c1d1") come out longer than the original.
import sys
from itertools import groupby


def main() -> None:
    s = sys.stdin.readline().strip()
    comp = "".join(f"{ch}{sum(1 for _ in grp)}" for ch, grp in groupby(s))
    print(comp)


if __name__ == "__main__":
    main()
