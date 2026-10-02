using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Akiba.Mobile.Models;

namespace Akiba.Mobile.Services;

public class SessionExpiredException() : Exception("Session expired.");

// No MAUI APIs in here: the token comes from a callback and the HTTP handler
// is swappable, so the sync tests can run this against a local server and
// switch the "network" off.
public class ApiClient(Func<Task<string?>> getToken, string baseUrl, HttpMessageHandler? handler = null)
{
    // camelCase in and out, matching the server.
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new UtcDateTimeConverter() },
    };

    private readonly HttpClient _http = new(handler ?? new HttpClientHandler())
    {
        BaseAddress = new Uri(baseUrl),
        Timeout = TimeSpan.FromSeconds(20),
    };

    // Everything the server wrote since `since` (the previous pull's
    // serverTime), including soft-deleted rows.
    public Task<SyncPullResponse> PullAsync(string since, CancellationToken ct = default) =>
        SendAsync<SyncPullResponse>(HttpMethod.Get, $"/api/sync/pull?since={Uri.EscapeDataString(since)}", null, ct);

    public Task<SyncPushResponse> PushAsync(SyncChanges changes, CancellationToken ct = default) =>
        SendAsync<SyncPushResponse>(HttpMethod.Post, "/api/sync/push", changes, ct);

    private async Task<T> SendAsync<T>(HttpMethod method, string path, object? body, CancellationToken ct)
    {
        using var req = new HttpRequestMessage(method, path);
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", await getToken());
        if (body is not null) req.Content = JsonContent.Create(body, options: Json);

        using var res = await _http.SendAsync(req, ct);
        if (res.StatusCode == HttpStatusCode.Unauthorized) throw new SessionExpiredException();
        res.EnsureSuccessStatusCode();
        return await res.Content.ReadFromJsonAsync<T>(Json, ct)
            ?? throw new InvalidDataException($"Empty response from {path}.");
    }

    // SQLite gives DateTimes back as Kind=Unspecified; they're all UTC, and
    // the server must see the "Z" or it would read them as local time.
    // Milliseconds only: that's what JavaScript dates parse and store.
    private sealed class UtcDateTimeConverter : JsonConverter<DateTime>
    {
        public override DateTime Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) =>
            reader.GetDateTime().ToUniversalTime();

        public override void Write(Utf8JsonWriter writer, DateTime value, JsonSerializerOptions options) =>
            writer.WriteStringValue(DateTime.SpecifyKind(value, DateTimeKind.Utc)
                .ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture));
    }
}
