import sys


def main() -> None:
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    a = sorted(int(x) for x in data[1:1 + n])
    med = a[n // 2]
    print(sum(abs(x - med) for x in a))


if __name__ == "__main__":
    main()
