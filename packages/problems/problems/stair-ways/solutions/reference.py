import sys

MOD = 10**9 + 7


def main() -> None:
    n = int(sys.stdin.read().split()[0])
    if n <= 1:
        print(1)
        return
    a, b = 1, 1
    for _ in range(2, n + 1):
        a, b = b, (a + b) % MOD
    print(b % MOD)


if __name__ == "__main__":
    main()
