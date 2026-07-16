import sys


def main() -> None:
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    it = iter(data[1:1 + 2 * n])
    bookings = sorted((int(e), int(s)) for s, e in zip(it, it))
    count = 0
    last_end = 0  # all start times are >= 0
    for e, s in bookings:
        if s >= last_end:
            count += 1
            last_end = e
    print(count)


if __name__ == "__main__":
    main()
