import sys


def main() -> None:
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    take = 0  # best total for a prefix whose last chest is taken
    skip = 0  # best total for a prefix whose last chest is skipped
    for tok in data[1:1 + n]:
        x = int(tok)
        take, skip = skip + x, max(skip, take)
    print(max(take, skip))


if __name__ == "__main__":
    main()
