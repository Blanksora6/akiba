using System.Globalization;
using Akiba.Mobile.Services;

namespace Akiba.Mobile.ViewModels;

// Shared display formatting, so both screens show money and sync status the same way.
public static class Format
{
    public static string Money(decimal amount) =>
        $"KES {amount.ToString("N2", CultureInfo.InvariantCulture)}";

    public static string SignedMoney(decimal amount) =>
        (amount < 0 ? "-" : "+") + Money(Math.Abs(amount));

    public static string SyncStatus(SyncResult result, DateTime? lastSyncedAt) => result switch
    {
        SyncResult.Synced => "Up to date",
        SyncResult.Offline => "Offline — showing saved data",
        SyncResult.AlreadyRunning => "Syncing…",
        _ => lastSyncedAt is { } t
            ? $"Couldn't reach the server — last synced {t:HH:mm}"
            : "Couldn't reach the server — showing saved data",
    };
}
