# Plausibly-wrong solution: instead of shrinking the window one step at a
# time, it RESETS the window entirely whenever the budget is exceeded.
# This misses stretches that straddle a reset point.
import sys


def main() -> None:
    data = sys.stdin.buffer.read().split()
    n, s = int(data[0]), int(data[1])
    a = [int(x) for x in data[2:2 + n]]
    best = 0
    window = 0
    length = 0
    for x in a:
        window += x
        length += 1
        if window > s:
            window = 0
            length = 0
        best = max(best, length)
    print(best)


if __name__ == "__main__":
    main()
