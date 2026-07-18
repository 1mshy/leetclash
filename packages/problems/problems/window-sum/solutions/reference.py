import sys


def main() -> None:
    data = sys.stdin.read().split()
    n, k = int(data[0]), int(data[1])
    a = [int(x) for x in data[2:2 + n]]
    s = sum(a[:k])
    best = s
    for i in range(k, n):
        s += a[i] - a[i - k]
        if s > best:
            best = s
    print(best)


if __name__ == "__main__":
    main()
