import sys
from collections import deque


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

    dist = [[-1] * c for _ in range(r)]
    dist[start[0]][start[1]] = 0
    q = deque([start])
    while q:
        i, j = q.popleft()
        if (i, j) == goal:
            break
        for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ni, nj = i + di, j + dj
            if 0 <= ni < r and 0 <= nj < c and grid[ni][nj] != "#" and dist[ni][nj] == -1:
                dist[ni][nj] = dist[i][j] + 1
                q.append((ni, nj))
    print(dist[goal[0]][goal[1]])


if __name__ == "__main__":
    main()
