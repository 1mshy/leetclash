# Plausibly-wrong solution: uses a non-strict comparison (bisect_right), which
# computes the longest NON-DECREASING chain. Equal heights then stack into one
# chain, overcounting whenever heights repeat.
import sys
from bisect import bisect_right


def main() -> None:
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    h = [int(x) for x in data[1:1 + n]]
    tails = []
    for x in h:
        i = bisect_right(tails, x)
        if i == len(tails):
            tails.append(x)
        else:
            tails[i] = x
    print(len(tails))


if __name__ == "__main__":
    main()
