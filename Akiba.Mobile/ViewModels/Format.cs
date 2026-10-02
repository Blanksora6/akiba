using System.Globalization;
using Akiba.Mobile.Services;

namespace Akiba.Mobile.ViewModels;

// Shared display formatting, so every screen shows money and sync status the same way.
public static class Format
{
    public static string Money(decimal amount) =>
        $"KES {amount.ToString("N2", CultureInfo.InvariantCulture)}";

    public static string SignedMoney(decimal amount) =>
        (amount < 0 ? "-" : "+") + Money(Math.Abs(amount));

    // One line under each screen: pending local changes first (that's what
    // the user cares about offline), otherwise how the last sync went.
    public static string SyncStatus(SyncResult? last, DateTime? lastSyncedAt, int pending)
    {
        if (pending > 0)
        {
            var changes = pending == 1 ? "1 change" : $"{pending} changes";
            return last == SyncResult.Synced ? $"{changes} syncing…" : $"{changes} saved on this phone — will sync when online";
        }
        return last switch
        {
            SyncResult.Synced => lastSyncedAt is { } t ? $"Up to date · {t:HH:mm}" : "Up to date",
            SyncResult.Offline => "Offline — showing saved data",
            SyncResult.Failed => lastSyncedAt is { } t
                ? $"Couldn't reach the server — last synced {t:HH:mm}"
                : "Couldn't reach the server — showing saved data",
            _ => "",
        };
    }
}
