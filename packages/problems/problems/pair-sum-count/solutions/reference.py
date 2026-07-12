import sys
from collections import Counter


def main() -> None:
    data = sys.stdin.buffer.read().split()
    n, k = int(data[0]), int(data[1])
    a = [int(x) for x in data[2:2 + n]]
    seen: Counter[int] = Counter()
    total = 0
    for x in a:
        total += seen[k - x]
        seen[x] += 1
    print(total)


if __name__ == "__main__":
    main()
