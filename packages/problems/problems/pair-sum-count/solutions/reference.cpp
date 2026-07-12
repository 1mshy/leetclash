#include <cstdint>
#include <iostream>
#include <unordered_map>
#include <vector>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    long long n, k;
    if (!(cin >> n >> k)) return 0;
    unordered_map<long long, long long> seen;
    seen.reserve(static_cast<size_t>(n) * 2);
    long long total = 0;
    for (long long i = 0; i < n; ++i) {
        long long x;
        cin >> x;
        auto it = seen.find(k - x);
        if (it != seen.end()) total += it->second;
        ++seen[x];
    }
    cout << total << "\n";
    return 0;
}
