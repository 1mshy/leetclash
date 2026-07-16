import sys


def main() -> None:
    data = sys.stdin.buffer.read().split()
    n, k = int(data[0]), int(data[1])
    a = [int(x) for x in data[2:2 + n]]
    window = sum(a[:k])
    best = window
    for i in range(k, n):
        window += a[i] - a[i - k]
        if window > best:
            best = window
    print(best)


if __name__ == "__main__":
    main()
