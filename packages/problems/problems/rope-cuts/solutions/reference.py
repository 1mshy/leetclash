import sys


def main() -> None:
    data = sys.stdin.buffer.read().split()
    n, k = int(data[0]), int(data[1])
    lens = [int(x) for x in data[2:2 + n]]

    def enough(piece: int) -> bool:
        total = 0
        for x in lens:
            total += x // piece
            if total >= k:
                return True
        return False

    lo, hi = 1, max(lens)
    best = 0
    while lo <= hi:
        mid = (lo + hi) // 2
        if enough(mid):
            best = mid
            lo = mid + 1
        else:
            hi = mid - 1
    print(best)


if __name__ == "__main__":
    main()
