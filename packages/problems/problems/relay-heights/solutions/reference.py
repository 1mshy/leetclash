import sys
from bisect import bisect_left


def main() -> None:
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    h = [int(x) for x in data[1:1 + n]]
    tails = []  # tails[i] = smallest tail of a strictly increasing chain of length i+1
    for x in h:
        i = bisect_left(tails, x)
        if i == len(tails):
            tails.append(x)
        else:
            tails[i] = x
    print(len(tails))


if __name__ == "__main__":
    main()
