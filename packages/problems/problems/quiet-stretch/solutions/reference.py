import sys


def main() -> None:
    data = sys.stdin.buffer.read().split()
    n, s = int(data[0]), int(data[1])
    a = [int(x) for x in data[2:2 + n]]
    best = 0
    left = 0
    window = 0
    for right, x in enumerate(a):
        window += x
        while window > s and left <= right:
            window -= a[left]
            left += 1
        best = max(best, right - left + 1)
    print(best)


if __name__ == "__main__":
    main()
