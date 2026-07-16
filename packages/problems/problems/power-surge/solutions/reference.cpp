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
    long long window = 0;
    for (long long i = 0; i < k; ++i) window += a[i];
    long long best = window;
    for (long long i = k; i < n; ++i) {
        window += a[i] - a[i - k];
        if (window > best) best = window;
    }
    cout << best << "\n";
    return 0;
}
