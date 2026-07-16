# Plausibly-wrong solution: welds the segments left to right in input order
# instead of always fusing the two shortest, so long early segments get
# re-melted into every later weld and the tally comes out too high.
import sys


def main() -> None:
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    a = [int(x) for x in data[1:1 + n]]
    cur = a[0]
    total = 0
    for x in a[1:]:
        cur += x
        total += cur
    print(total)


if __name__ == "__main__":
    main()
