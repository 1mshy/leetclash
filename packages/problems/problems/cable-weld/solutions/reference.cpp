#include <cstdint>
#include <iostream>
#include <queue>
#include <vector>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    long long n;
    if (!(cin >> n)) return 0;
    priority_queue<long long, vector<long long>, greater<long long>> pq;
    for (long long i = 0; i < n; ++i) {
        long long x;
        cin >> x;
        pq.push(x);
    }
    long long total = 0;
    while (pq.size() > 1) {
        long long x = pq.top();
        pq.pop();
        long long y = pq.top();
        pq.pop();
        total += x + y;
        pq.push(x + y);
    }
    cout << total << "\n";
    return 0;
}
