# Plausibly-wrong solution: assumes the optimal haul is either all the
# even-indexed chests or all the odd-indexed chests, whichever is worth more.
# Fails whenever the best selection mixes parities, e.g. [5, 1, 1, 5] where
# the optimum takes positions 1 and 4.
import sys


def main() -> None:
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    a = [int(x) for x in data[1:1 + n]]
    print(max(sum(a[0::2]), sum(a[1::2])))


if __name__ == "__main__":
    main()
