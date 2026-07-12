# Plausibly-wrong solution: treats the search like a grid DP that only ever
# moves DOWN or RIGHT. Correct whenever a monotone staircase path is optimal,
# wrong (or reports -1) whenever the shortest route must back-track up/left.
import sys


def main() -> None:
    data = sys.stdin.read().split()
    r, c = int(data[0]), int(data[1])
    grid = data[2:2 + r]

    start = goal = None
    for i in range(r):
        for j in range(c):
            if grid[i][j] == "F":
                start = (i, j)
            elif grid[i][j] == "H":
                goal = (i, j)

    INF = float("inf")
    dist = [[INF] * c for _ in range(r)]
    dist[start[0]][start[1]] = 0
    for i in range(r):
        for j in range(c):
            if grid[i][j] == "#" or dist[i][j] is INF:
                continue
            if i + 1 < r and grid[i + 1][j] != "#":
                dist[i + 1][j] = min(dist[i + 1][j], dist[i][j] + 1)
            if j + 1 < c and grid[i][j + 1] != "#":
                dist[i][j + 1] = min(dist[i][j + 1], dist[i][j] + 1)
    d = dist[goal[0]][goal[1]]
    print(-1 if d is INF else d)


if __name__ == "__main__":
    main()
