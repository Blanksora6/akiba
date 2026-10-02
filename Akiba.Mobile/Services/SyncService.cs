namespace Akiba.Mobile.Services;

public enum SyncResult { Synced, Offline, Failed, AlreadyRunning }

// The app-facing side of sync: decides when to run SyncEngine (app start,
// pull-to-refresh, after a local edit, whenever the phone regains internet)
// and turns its errors into events the screens can show.
public class SyncService(LocalDb db, SyncEngine engine, AuthService auth)
{
    private readonly SemaphoreSlim _gate = new(1, 1);
    private bool _watching;

    // Raised on the main thread whenever local data changed (a sync landed,
    // or the user edited something).
    public event Action? DataChanged;

    // Raised on the main thread when the server rejects our token.
    public event Action? SessionExpired;

    public DateTime? LastSyncedAt { get; private set; }
    public SyncResult? LastResult { get; private set; }

    public async Task<SyncResult> SyncAsync()
    {
        if (Connectivity.Current.NetworkAccess != NetworkAccess.Internet) return Done(SyncResult.Offline);
        if (!await _gate.WaitAsync(0)) return SyncResult.AlreadyRunning;
        try
        {
            await engine.RunAsync();
            LastSyncedAt = DateTime.Now;
            MainThread.BeginInvokeOnMainThread(() => DataChanged?.Invoke());
            return Done(SyncResult.Synced);
        }
        catch (SessionExpiredException)
        {
            // Pending edits stay in the outbox and go up after signing back in.
            auth.ForgetSession();
            MainThread.BeginInvokeOnMainThread(() => SessionExpired?.Invoke());
            return Done(SyncResult.Failed);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or IOException)
        {
            // Flaky connection or server hiccup — local data and the outbox
            // stay as they are; the next sync retries.
            return Done(SyncResult.Failed);
        }
        finally
        {
            _gate.Release();
        }
    }

    // After a local edit: refresh screens now, push in the background.
    public void NotifyLocalChange()
    {
        DataChanged?.Invoke();
        _ = SyncAsync();
    }

    private SyncResult Done(SyncResult result)
    {
        LastResult = result;
        return result;
    }

    public Task<int> PendingCountAsync() => db.PendingCountAsync();

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
