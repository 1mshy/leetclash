import sys


def main() -> None:
    data = sys.stdin.buffer.read().split()
    n, w = int(data[0]), int(data[1])
    ws = sorted(int(x) for x in data[2:2 + n])
    i, j = 0, n - 1
    trips = 0
    while i <= j:
        if i < j and ws[i] + ws[j] <= w:
            i += 1  # the lightest remaining crate rides along with the heaviest
        j -= 1
        trips += 1
    print(trips)


if __name__ == "__main__":
    main()
