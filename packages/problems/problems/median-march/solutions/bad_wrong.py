# Plausibly-wrong solution: rallies everyone at the rounded arithmetic mean
# instead of the median. Skewed camps (e.g. 0 0 0 100) pull the mean far
# from the optimal marker and inflate the total cost.
import sys


def main() -> None:
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    a = [int(x) for x in data[1:1 + n]]
    m = round(sum(a) / n)
    print(sum(abs(x - m) for x in a))


if __name__ == "__main__":
    main()
