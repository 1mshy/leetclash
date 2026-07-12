#include <deque>
#include <iostream>
#include <string>
#include <utility>
#include <vector>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int r, c;
    if (!(cin >> r >> c)) return 0;
    vector<string> grid(r);
    for (auto &row : grid) cin >> row;

    int si = -1, sj = -1, gi = -1, gj = -1;
    for (int i = 0; i < r; ++i)
        for (int j = 0; j < c; ++j) {
            if (grid[i][j] == 'F') { si = i; sj = j; }
            else if (grid[i][j] == 'H') { gi = i; gj = j; }
        }

    vector<vector<int>> dist(r, vector<int>(c, -1));
    deque<pair<int, int>> q;
    dist[si][sj] = 0;
    q.emplace_back(si, sj);
    const int di[4] = {1, -1, 0, 0};
    const int dj[4] = {0, 0, 1, -1};
    while (!q.empty()) {
        auto [i, j] = q.front();
        q.pop_front();
        if (i == gi && j == gj) break;
        for (int d = 0; d < 4; ++d) {
            int ni = i + di[d], nj = j + dj[d];
            if (ni >= 0 && ni < r && nj >= 0 && nj < c && grid[ni][nj] != '#' &&
                dist[ni][nj] == -1) {
                dist[ni][nj] = dist[i][j] + 1;
                q.emplace_back(ni, nj);
            }
        }
    }
    cout << dist[gi][gj] << "\n";
    return 0;
}
