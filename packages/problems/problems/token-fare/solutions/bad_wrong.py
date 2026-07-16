# Plausibly-wrong solution: greedy — always feed the largest denomination that
# still fits, then the next largest, and so on. Optimal for round denomination
# systems, wrong in general: with denominations {1, 3, 4} and fare 6 it pays
# 4 + 1 + 1 (three tokens) while the optimum is 3 + 3 (two). It can also claim
# -1 for payable fares, e.g. {4, 5} with fare 13.
import sys


def main() -> None:
    data = sys.stdin.buffer.read().split()
    k, f = int(data[0]), int(data[1])
    dens = sorted((int(x) for x in data[2:2 + k]), reverse=True)
    remaining = f
    used = 0
    for d in dens:
        used += remaining // d
        remaining %= d
    print(used if remaining == 0 else -1)


if __name__ == "__main__":
    main()
