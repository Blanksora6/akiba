namespace Akiba.Mobile.Services;

// One sync round: push local edits, then pull everything new. Pure logic —
// no MAUI APIs — so the offline/reconnect tests run it directly. Network and
// session errors propagate; SyncService decides what to do with them.
public class SyncEngine(LocalDb db, ApiClient api)
{
    public const string LastPulledKey = "lastPulledAt";
    private const string FirstSync = "1970-01-01T00:00:00.000Z";

    public async Task RunAsync(CancellationToken ct = default)
    {
        // Push first, so the pull that follows already reflects our edits.
        var (maxOutboxId, pending) = await db.GetPendingAsync();
        if (pending.Count > 0)
        {
            var pushed = await api.PushAsync(pending, ct);
            await db.ClearOutboxUpToAsync(maxOutboxId);
            // Our edits that lost to a newer server version: take the server's.
            await db.ApplyServerRowsAsync(pushed.Current);
        }

        var since = await db.GetStateAsync(LastPulledKey) ?? FirstSync;
        var pull = await api.PullAsync(since, ct);
        await db.ApplyServerRowsAsync(pull);
        await db.SetStateAsync(LastPulledKey, pull.ServerTime);
    }
}
