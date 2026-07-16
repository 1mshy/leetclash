#include <cstdint>
#include <iostream>
#include <vector>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    long long n, k;
    if (!(cin >> n >> k)) return 0;
    vector<long long> lens(n);
    long long hi = 0;
    for (auto &x : lens) {
        cin >> x;
        if (x > hi) hi = x;
    }
    long long lo = 1, best = 0;
    while (lo <= hi) {
        long long mid = lo + (hi - lo) / 2;
        long long total = 0;
        for (auto x : lens) {
            total += x / mid;
            if (total >= k) break;
        }
        if (total >= k) {
            best = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    cout << best << "\n";
    return 0;
}
