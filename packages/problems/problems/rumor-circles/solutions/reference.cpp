#include <cstdint>
#include <iostream>
#include <numeric>
#include <vector>
using namespace std;

static vector<int> parent;

static int find(int x) {
    while (parent[x] != x) {
        parent[x] = parent[parent[x]];
        x = parent[x];
    }
    return x;
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int n, m;
    if (!(cin >> n >> m)) return 0;
    parent.resize(n + 1);
    iota(parent.begin(), parent.end(), 0);
    int comps = n;
    for (int i = 0; i < m; ++i) {
        int u, v;
        cin >> u >> v;
        int ru = find(u), rv = find(v);
        if (ru != rv) {
            parent[ru] = rv;
            --comps;
        }
    }
    cout << comps << "\n";
    return 0;
}
