# Plausibly-wrong solution: assumes every roster entry merges two different
# circles, so it prints max(1, n - m). Duplicate pairs and friendship loops
# merge nothing, making this undercount the circles.
import sys


def main() -> None:
    data = sys.stdin.buffer.read().split()
    n, m = int(data[0]), int(data[1])
    print(max(1, n - m))


if __name__ == "__main__":
    main()
