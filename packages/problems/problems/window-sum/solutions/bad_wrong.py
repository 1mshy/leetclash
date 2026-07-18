import sys


def main() -> None:
    # WRONG: always reports the first window instead of the maximum window.
    data = sys.stdin.read().split()
    n, k = int(data[0]), int(data[1])
    a = [int(x) for x in data[2:2 + n]]
    print(sum(a[:k]))


if __name__ == "__main__":
    main()
