# Plausibly-wrong solution: uses a set of distinct values instead of a
# multiset, so it counts each complementary VALUE pair at most once and
# breaks whenever duplicate values are involved.
import sys


def main() -> None:
    data = sys.stdin.buffer.read().split()
    n, k = int(data[0]), int(data[1])
    a = [int(x) for x in data[2:2 + n]]
    seen: set[int] = set()
    total = 0
    for x in a:
        if k - x in seen:
            total += 1
        seen.add(x)
    print(total)


if __name__ == "__main__":
    main()
