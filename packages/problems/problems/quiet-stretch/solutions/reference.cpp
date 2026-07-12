#include <algorithm>
#include <cstdint>
#include <iostream>
#include <vector>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    long long n, s;
    if (!(cin >> n >> s)) return 0;
    vector<long long> a(n);
    for (auto &x : a) cin >> x;
    long long best = 0, window = 0;
    size_t left = 0;
    for (size_t right = 0; right < a.size(); ++right) {
        window += a[right];
        while (window > s && left <= right) {
            window -= a[left];
            ++left;
        }
        best = max(best, static_cast<long long>(right - left + 1));
    }
    cout << best << "\n";
    return 0;
}
