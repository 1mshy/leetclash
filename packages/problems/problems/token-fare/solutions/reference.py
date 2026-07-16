import sys


def main() -> None:
    data = sys.stdin.buffer.read().split()
    k, f = int(data[0]), int(data[1])
    dens = [int(x) for x in data[2:2 + k]]
    inf = f + 1  # any payable fare uses at most f tokens (each token >= 1)
    dp = [0] + [inf] * f
    for d in dens:
        for v in range(d, f + 1):
            c = dp[v - d] + 1
            if c < dp[v]:
                dp[v] = c
    print(dp[f] if dp[f] <= f else -1)


if __name__ == "__main__":
    main()
