#include <algorithm>
#include <iostream>
#include <vector>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    long long n, k;
    if (!(cin >> n >> k)) return 0;
    vector<long long> a(n);
    for (auto &x : a) cin >> x;
    long long s = 0;
    for (long long i = 0; i < k; i++) s += a[i];
    long long best = s;
    for (long long i = k; i < n; i++) {
        s += a[i] - a[i - k];
        best = max(best, s);
    }
    cout << best << "\n";
    return 0;
}
