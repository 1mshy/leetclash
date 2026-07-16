#include <algorithm>
#include <iostream>
#include <vector>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    long long n;
    if (!(cin >> n)) return 0;
    vector<pair<long long, long long>> v(n);  // (end, start)
    for (auto &p : v) cin >> p.second >> p.first;
    sort(v.begin(), v.end());
    long long cnt = 0, last = 0;
    for (const auto &b : v) {
        if (b.second >= last) {
            ++cnt;
            last = b.first;
        }
    }
    cout << cnt << "\n";
    return 0;
}
