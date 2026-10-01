using Akiba.Mobile.Models;
using SQLite;

namespace Akiba.Mobile.Services;

// What the screens show, already joined and filtered.
public record SpendingItem(Guid ClassId, string ClassName, string ColorHex, decimal Total, decimal Limit);
public record TransactionItem(Guid Id, Guid ClassId, string SubjectName, string ClassName, string ColorHex, decimal Amount, string? Note, DateTime OccurredAt);

// The phone's own copy of the user's data. Screens only ever read from here —
// never straight from the API — so everything works the same offline.
public class LocalDb
{
    private readonly SQLiteAsyncConnection _db = new(
        Path.Combine(FileSystem.AppDataDirectory, "akiba.db3"),
        SQLiteOpenFlags.ReadWrite | SQLiteOpenFlags.Create | SQLiteOpenFlags.SharedCache);

    private Task? _init;

    private Task InitAsync() => _init ??= _db.CreateTablesAsync(CreateFlags.None,
        typeof(ClassRow), typeof(SubjectRow), typeof(TransactionRow), typeof(GoalRow), typeof(SyncStateRow));

    private static DateTime Utc(DateTime d) => DateTime.SpecifyKind(d, DateTimeKind.Utc);

    // Server rows overwrite local ones. Safe while the phone is read-only;
    // once offline edits exist, rows with unpushed local changes will need
    // to be kept instead (that's the outbox step).
    public async Task ApplyPullAsync(SyncPullResponse pull)
    {
        await InitAsync();
        await _db.RunInTransactionAsync(conn =>
        {
            foreach (var r in pull.Classes) conn.InsertOrReplace(r);
            foreach (var r in pull.Subjects) conn.InsertOrReplace(r);
            foreach (var r in pull.Transactions) conn.InsertOrReplace(r);
            foreach (var r in pull.Goals) conn.InsertOrReplace(r);
        });
    }

    public async Task<string?> GetStateAsync(string key)
    {
        await InitAsync();
        return (await _db.FindAsync<SyncStateRow>(key))?.Value;
    }

    public async Task SetStateAsync(string key, string value)
    {
        await InitAsync();
        await _db.InsertOrReplaceAsync(new SyncStateRow { Key = key, Value = value });
    }

    // Wipes everything — on sign-out, or when a different account signs in.
    public async Task ClearAsync()
    {
        await InitAsync();
        await _db.RunInTransactionAsync(conn =>
        {
            conn.DeleteAll<ClassRow>();
            conn.DeleteAll<SubjectRow>();
            conn.DeleteAll<TransactionRow>();
            conn.DeleteAll<GoalRow>();
            conn.DeleteAll<SyncStateRow>();
        });
    }

    // Transactions whose own row, subject and class are all live — the same
    // visibility rule the server applies. Joined in memory: a personal
    // finance history is small enough that this is simpler than SQL joins.
    private async Task<List<TransactionItem>> VisibleTransactionsAsync()
    {
        await InitAsync();
        var classes = (await _db.Table<ClassRow>().Where(c => !c.IsDeleted).ToListAsync()).ToDictionary(c => c.Id);
        var subjects = (await _db.Table<SubjectRow>().Where(s => !s.IsDeleted).ToListAsync()).ToDictionary(s => s.Id);
        var txns = await _db.Table<TransactionRow>().Where(t => !t.IsDeleted).ToListAsync();

        var items = new List<TransactionItem>();
        foreach (var t in txns)
        {
            if (!subjects.TryGetValue(t.SubjectId, out var s) || !classes.TryGetValue(s.ClassId, out var c)) continue;
            items.Add(new TransactionItem(t.Id, c.Id, s.Name, c.Name, c.ColorHex, t.Amount, t.Note, Utc(t.OccurredAt)));
        }
        return items;
    }

    public async Task<List<TransactionItem>> GetTransactionsAsync() =>
        (await VisibleTransactionsAsync()).OrderByDescending(t => t.OccurredAt).ToList();

    public async Task<decimal> GetBalanceAsync() =>
        (await VisibleTransactionsAsync()).Sum(t => t.Amount);

    // Expenses per class for one month, biggest first. UTC month bounds, same
    // as the server's spending summary.
    public async Task<List<SpendingItem>> GetMonthSpendingAsync(int year, int month)
    {
        var start = new DateTime(year, month, 1, 0, 0, 0, DateTimeKind.Utc);
        var end = start.AddMonths(1);
        await InitAsync();
        var limits = (await _db.Table<ClassRow>().ToListAsync()).ToDictionary(c => c.Id, c => c.MonthlyLimit);

        return (await VisibleTransactionsAsync())
            .Where(t => t.Amount < 0 && t.OccurredAt >= start && t.OccurredAt < end)
            .GroupBy(t => (t.ClassId, t.ClassName, t.ColorHex))
            .Select(g => new SpendingItem(g.Key.ClassId, g.Key.ClassName, g.Key.ColorHex, -g.Sum(t => t.Amount),
                limits.GetValueOrDefault(g.Key.ClassId)))
            .OrderByDescending(s => s.Total)
            .ToList();
    }
}
