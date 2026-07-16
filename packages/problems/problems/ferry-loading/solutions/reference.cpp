#include <algorithm>
#include <iostream>
#include <vector>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    long long n, w;
    if (!(cin >> n >> w)) return 0;
    vector<long long> a(n);
    for (auto &x : a) cin >> x;
    sort(a.begin(), a.end());
    long long i = 0, j = n - 1, trips = 0;
    while (i <= j) {
        if (i < j && a[i] + a[j] <= w) ++i;
        --j;
        ++trips;
    }
    cout << trips << "\n";
    return 0;
}
