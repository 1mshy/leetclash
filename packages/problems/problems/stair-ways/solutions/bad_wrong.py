import sys


def main() -> None:
    # WRONG: forgets to take the answer modulo 1e9+7, so large n overflow-diverge.
    n = int(sys.stdin.read().split()[0])
    if n <= 1:
        print(1)
        return
    a, b = 1, 1
    for _ in range(2, n + 1):
        a, b = b, a + b
    print(b)


if __name__ == "__main__":
    main()
