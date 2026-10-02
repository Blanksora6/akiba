using System.Diagnostics;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Akiba.Mobile.Services;

namespace Akiba.Mobile.Tests;

// A real API server (akiba-web/server/test-server.js: the production router
// on an in-memory Postgres) with one signed-in user. One per test, so tests
// can't see each other's data.
public sealed class TestServer : IAsyncDisposable
{
    private readonly Process _process;
    public string BaseUrl { get; }
    public string Token { get; }

    private TestServer(Process process, string baseUrl, string token)
    {
        _process = process;
        BaseUrl = baseUrl;
        Token = token;
    }

    public static async Task<TestServer> StartAsync()
    {
        var webDir = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "akiba-web"));
        var process = Process.Start(new ProcessStartInfo("node", "server/test-server.js")
        {
            WorkingDirectory = webDir,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
        }) ?? throw new InvalidOperationException("Couldn't start node.");

        var line = await process.StandardOutput.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(60))
            ?? throw new InvalidOperationException($"Test server exited: {await process.StandardError.ReadToEndAsync()}");
        using var info = JsonDocument.Parse(line);
        var port = info.RootElement.GetProperty("port").GetInt32();
        return new TestServer(process, $"http://127.0.0.1:{port}", info.RootElement.GetProperty("token").GetString()!);
    }

    // The web app's view of the account: plain REST calls, as the browser makes them.
    public HttpClient Web()
    {
        var http = new HttpClient { BaseAddress = new Uri(BaseUrl) };
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", Token);
        return http;
    }

    public ValueTask DisposeAsync()
    {
        if (!_process.HasExited) _process.Kill(entireProcessTree: true);
        _process.Dispose();
        return ValueTask.CompletedTask;
    }
}

// Stands in for the phone's connection: flip Online off for airplane mode.
public sealed class NetworkSwitch() : DelegatingHandler(new HttpClientHandler())
{
    public bool Online { get; set; } = true;

    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) =>
        Online ? base.SendAsync(request, ct) : throw new HttpRequestException("No network (test).");
}

// One phone: its own SQLite file, its own network switch, the real SyncEngine.
public sealed class Phone : IDisposable
{
    private readonly string _path = Path.Combine(Path.GetTempPath(), $"akiba-test-{Guid.NewGuid():N}.db3");
    public LocalDb Db { get; }
    public NetworkSwitch Network { get; } = new();
    // Shift this phone's clock, e.g. to stamp an edit as made hours ago.
    public TimeSpan ClockOffset { get; set; }
    public SyncEngine Engine { get; }

    public Phone(TestServer server)
    {
        Db = new LocalDb(_path, () => DateTime.UtcNow + ClockOffset);
        Engine = new SyncEngine(Db, new ApiClient(() => Task.FromResult<string?>(server.Token), server.BaseUrl, Network));
    }

    public Task SyncAsync() => Engine.RunAsync();

    public void Dispose()
    {
        SQLite.SQLiteAsyncConnection.ResetPool();
        try { File.Delete(_path); } catch (IOException) { /* still locked on Windows; temp dir anyway */ }
    }
}

public static class WebApi
{
    public static async Task<List<JsonElement>> TransactionsAsync(this HttpClient web) =>
        (await web.GetFromJsonAsync<List<JsonElement>>("/api/transactions"))!;
}
