# Plausibly-wrong solution: pretends the ropes form one big pooled length and
# prints floor(total_length / k). Each piece must come from a single rope, so
# per-rope leftovers make this answer too optimistic on multi-rope racks.
import sys


def main() -> None:
    data = sys.stdin.buffer.read().split()
    n, k = int(data[0]), int(data[1])
    lens = [int(x) for x in data[2:2 + n]]
    print(sum(lens) // k)


if __name__ == "__main__":
    main()
