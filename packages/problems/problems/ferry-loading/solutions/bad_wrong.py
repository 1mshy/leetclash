# Plausibly-wrong solution: sorts the crates and pairs neighbours (i with i+1)
# whenever they fit under the limit. Pairing lightest-with-heaviest is strictly
# better: weights [1, 2, 3, 4] with W = 5 need only 2 crossings, but adjacent
# pairing ships (1,2) together and 3, 4 alone — 3 crossings.
import sys


def main() -> None:
    data = sys.stdin.buffer.read().split()
    n, w = int(data[0]), int(data[1])
    ws = sorted(int(x) for x in data[2:2 + n])
    trips = 0
    i = 0
    while i < n:
        if i + 1 < n and ws[i] + ws[i + 1] <= w:
            i += 2
        else:
            i += 1
        trips += 1
    print(trips)


if __name__ == "__main__":
    main()
