# Plausibly-wrong solution: sorts bookings by START time and greedily serves
# any booking that does not overlap the last served one. A long early booking
# then blocks several short later ones: with [0,10), [1,3), [4,6) it serves
# only [0,10) for a count of 1, while the optimum serves the two short slots.
import sys


def main() -> None:
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    it = iter(data[1:1 + 2 * n])
    bookings = sorted((int(s), int(e)) for s, e in zip(it, it))
    count = 0
    last_end = 0
    for s, e in bookings:
        if s >= last_end:
            count += 1
            last_end = e
    print(count)


if __name__ == "__main__":
    main()
