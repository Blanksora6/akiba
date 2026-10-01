using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Akiba.Mobile.Models;

namespace Akiba.Mobile.Services;

public class SessionExpiredException() : Exception("Session expired.");

public class ApiClient(AuthService auth)
{
    // camelCase in and out, matching the server.
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private readonly HttpClient _http = new()
    {
        BaseAddress = new Uri(Config.ApiBase),
        Timeout = TimeSpan.FromSeconds(20),
    };

    // Everything changed since `since` (an ISO timestamp — the previous
    // pull's serverTime), including soft-deleted rows.
    public async Task<SyncPullResponse> PullAsync(string since, CancellationToken ct = default)
    {
        using var req = new HttpRequestMessage(HttpMethod.Get, $"/api/sync/pull?since={Uri.EscapeDataString(since)}");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", await auth.GetTokenAsync());

        using var res = await _http.SendAsync(req, ct);
        if (res.StatusCode == HttpStatusCode.Unauthorized) throw new SessionExpiredException();
        res.EnsureSuccessStatusCode();
        return await res.Content.ReadFromJsonAsync<SyncPullResponse>(Json, ct)
            ?? throw new InvalidDataException("Empty sync response.");
    }
}
