namespace Akiba.Mobile.Services;

public enum SyncResult { Synced, Offline, Failed, AlreadyRunning }

// Pulls server changes into LocalDb. Runs on app start, pull-to-refresh, and
// whenever the phone regains internet. (Pushing local edits — the outbox —
// comes next; for now the phone is read-only.)
public class SyncService(LocalDb db, ApiClient api, AuthService auth)
{
    private const string LastPulledKey = "lastPulledAt";
    private const string FirstSync = "1970-01-01T00:00:00.000Z";

    private readonly SemaphoreSlim _gate = new(1, 1);
    private bool _watching;

    // Raised (on the main thread) after new data lands in LocalDb.
    public event Action? DataChanged;

    // Raised (on the main thread) when the server rejects our token.
    public event Action? SessionExpired;

    public DateTime? LastSyncedAt { get; private set; }

    public async Task<SyncResult> SyncAsync()
    {
        if (Connectivity.Current.NetworkAccess != NetworkAccess.Internet) return SyncResult.Offline;
        if (!await _gate.WaitAsync(0)) return SyncResult.AlreadyRunning;
        try
        {
            var since = await db.GetStateAsync(LastPulledKey) ?? FirstSync;
            var pull = await api.PullAsync(since);
            await db.ApplyPullAsync(pull);
            await db.SetStateAsync(LastPulledKey, pull.ServerTime);
            LastSyncedAt = DateTime.Now;

            MainThread.BeginInvokeOnMainThread(() => DataChanged?.Invoke());
            return SyncResult.Synced;
        }
        catch (SessionExpiredException)
        {
            auth.ForgetSession();
            MainThread.BeginInvokeOnMainThread(() => SessionExpired?.Invoke());
            return SyncResult.Failed;
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or IOException)
        {
            // Flaky connection or server hiccup — local data stays as it was.
            return SyncResult.Failed;
        }
        finally
        {
            _gate.Release();
        }
    }

    // Sync as soon as the phone comes back online.
    public void StartWatchingConnectivity()
    {
        if (_watching) return;
        _watching = true;
        Connectivity.Current.ConnectivityChanged += async (_, e) =>
        {
            if (e.NetworkAccess == NetworkAccess.Internet && auth.IsSignedIn) await SyncAsync();
        };
    }
}
