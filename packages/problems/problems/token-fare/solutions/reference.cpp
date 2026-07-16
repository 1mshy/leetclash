#include <algorithm>
#include <iostream>
#include <vector>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int k;
    long long f;
    if (!(cin >> k >> f)) return 0;
    vector<long long> dens(k);
    for (auto &d : dens) cin >> d;
    const long long inf = f + 1;  // any payable fare uses at most f tokens
    vector<long long> dp(f + 1, inf);
    dp[0] = 0;
    for (long long d : dens)
        for (long long v = d; v <= f; ++v)
            dp[v] = min(dp[v], dp[v - d] + 1);
    cout << (dp[f] <= f ? dp[f] : -1) << "\n";
    return 0;
}
