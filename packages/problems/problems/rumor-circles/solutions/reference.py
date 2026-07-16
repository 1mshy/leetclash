import sys


def main() -> None:
    data = sys.stdin.buffer.read().split()
    n, m = int(data[0]), int(data[1])
    parent = list(range(n + 1))

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]  # path halving keeps it iterative
            x = parent[x]
        return x

    comps = n
    idx = 2
    for _ in range(m):
        u, v = int(data[idx]), int(data[idx + 1])
        idx += 2
        ru, rv = find(u), find(v)
        if ru != rv:
            parent[ru] = rv
            comps -= 1
    print(comps)


if __name__ == "__main__":
    main()
