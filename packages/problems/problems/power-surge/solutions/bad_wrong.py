# Plausibly-wrong solution: assumes the best window is "the biggest reading,
# k times" and prints max(a) * k. The readings surrounding the maximum drag
# the true window sum below that bound whenever the log is not constant,
# and it is wildly wrong on negative-heavy logs.
import sys


def main() -> None:
    data = sys.stdin.buffer.read().split()
    n, k = int(data[0]), int(data[1])
    a = [int(x) for x in data[2:2 + n]]
    print(max(a) * k)


if __name__ == "__main__":
    main()
