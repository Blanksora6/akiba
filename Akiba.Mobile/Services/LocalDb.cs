using Akiba.Mobile.Models;
using SQLite;

namespace Akiba.Mobile.Services;

// What the screens show, already joined and filtered.
public record SpendingItem(Guid ClassId, string ClassName, string ColorHex, decimal Total, decimal Limit);
public record TransactionItem(Guid Id, Guid ClassId, Guid SubjectId, string SubjectName, string ClassName, string ColorHex,
    decimal Amount, string? Note, DateTime OccurredAt);
public record Category(ClassRow Class, List<SubjectRow> Subjects);

// The phone's own copy of the user's data. Screens only ever read from here —
// never straight from the API — so everything works the same offline.
//
// Every local edit stamps the row's UpdatedAt and adds an outbox entry; sync
// pushes those rows, then clears the entries. Pulled rows never overwrite a
// pending local edit that's newer (see ApplyServerRowsAsync).
//
// No MAUI APIs in here, so the sync tests can run it on a laptop. `clock`
// lets tests play a phone whose edits were made hours ago; the app uses UTC now.
public class LocalDb(string path, Func<DateTime>? clock = null)
{
    private readonly SQLiteAsyncConnection _db = new(path,
        SQLiteOpenFlags.ReadWrite | SQLiteOpenFlags.Create | SQLiteOpenFlags.SharedCache);

    private Task? _init;

    private Task InitAsync() => _init ??= _db.CreateTablesAsync(CreateFlags.None,
        typeof(ClassRow), typeof(SubjectRow), typeof(TransactionRow), typeof(GoalRow),
        typeof(SyncStateRow), typeof(OutboxRow));

    // sqlite-net hands DateTimes back with Kind=Unspecified; all of ours are UTC.
    private static DateTime Utc(DateTime d) => DateTime.SpecifyKind(d, DateTimeKind.Utc);

    // Edit timestamps at millisecond precision — what the server stores — so a
    // row and the server's copy of that same edit compare as equal, not newer.
    private DateTime NowMs()
    {
        var now = clock?.Invoke() ?? DateTime.UtcNow;
        return now.AddTicks(-(now.Ticks % TimeSpan.TicksPerMillisecond));
    }

    // ---------- Sync plumbing ----------

    // Rows from the server (a pull, or push's "you lost" list). A row with a
    // pending local edit is only replaced if the server's copy is newer — in
    // which case the local edit lost, so its outbox entry goes too.
    public async Task ApplyServerRowsAsync(SyncChanges changes)
    {
        await InitAsync();
        await _db.RunInTransactionAsync(conn =>
        {
            Apply(conn, EntityTypes.Class, changes.Classes, r => r.Id, r => r.UpdatedAt);
            Apply(conn, EntityTypes.Subject, changes.Subjects, r => r.Id, r => r.UpdatedAt);
            Apply(conn, EntityTypes.Transaction, changes.Transactions, r => r.Id, r => r.UpdatedAt);
            Apply(conn, EntityTypes.Goal, changes.Goals, r => r.Id, r => r.UpdatedAt);
        });
    }

    private static void Apply<T>(SQLiteConnection conn, string type, List<T> rows, Func<T, Guid> id, Func<T, DateTime> updatedAt)
        where T : new()
    {
        foreach (var row in rows)
        {
            var entityId = id(row);
            var pending = conn.ExecuteScalar<int>(
                "SELECT COUNT(*) FROM outbox WHERE EntityType = ? AND EntityId = ?", type, entityId) > 0;
            if (pending)
            {
                var local = conn.Find<T>(entityId);
                if (local is not null && updatedAt(local) >= updatedAt(row)) continue; // ours is newer — keep it
                conn.Execute("DELETE FROM outbox WHERE EntityType = ? AND EntityId = ?", type, entityId);
            }
            conn.InsertOrReplace(row);
        }
    }

    // Everything waiting to be pushed, plus the highest outbox id included —
    // only entries up to that id get cleared after the push, so an edit made
    // while the push was in flight stays queued.
    public async Task<(long MaxOutboxId, SyncChanges Changes)> GetPendingAsync()
    {
        await InitAsync();
        var entries = await _db.Table<OutboxRow>().ToListAsync();
        var changes = new SyncChanges();
        foreach (var e in entries)
        {
            switch (e.EntityType)
            {
                case EntityTypes.Class when await _db.FindAsync<ClassRow>(e.EntityId) is { } c: changes.Classes.Add(c); break;
                case EntityTypes.Subject when await _db.FindAsync<SubjectRow>(e.EntityId) is { } s: changes.Subjects.Add(s); break;
                case EntityTypes.Transaction when await _db.FindAsync<TransactionRow>(e.EntityId) is { } t: changes.Transactions.Add(t); break;
                case EntityTypes.Goal when await _db.FindAsync<GoalRow>(e.EntityId) is { } g: changes.Goals.Add(g); break;
            }
        }
        return (entries.Count == 0 ? 0 : entries.Max(e => e.Id), changes);
    }

    public async Task ClearOutboxUpToAsync(long maxId)
    {
        await InitAsync();
        await _db.ExecuteAsync("DELETE FROM outbox WHERE Id <= ?", maxId);
    }

    public async Task<int> PendingCountAsync()
    {
        await InitAsync();
        return await _db.Table<OutboxRow>().CountAsync();
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
            conn.DeleteAll<OutboxRow>();
        });
    }

    // ---------- Local edits (each one queues itself for push) ----------

    private async Task SaveAsync<T>(T row, string type, Guid id)
    {
        await InitAsync();
        await _db.RunInTransactionAsync(conn =>
        {
            conn.InsertOrReplace(row);
            // Re-queue rather than keep an old entry, so the entry's id is newer
            // than any push already in flight (see GetPendingAsync).
            conn.Execute("DELETE FROM outbox WHERE EntityType = ? AND EntityId = ?", type, id);
            conn.Insert(new OutboxRow { EntityType = type, EntityId = id });
        });
    }

    public async Task<ClassRow> CreateClassAsync(Guid userId, string name, string colorHex, decimal monthlyLimit)
    {
        var row = new ClassRow
        {
            Id = Guid.NewGuid(), UserId = userId, Name = name, ColorHex = colorHex,
            MonthlyLimit = monthlyLimit, UpdatedAt = NowMs(),
        };
        await SaveAsync(row, EntityTypes.Class, row.Id);
        return row;
    }

    public async Task<SubjectRow> CreateSubjectAsync(Guid classId, string name)
    {
        var row = new SubjectRow { Id = Guid.NewGuid(), ClassId = classId, Name = name, UpdatedAt = NowMs() };
        await SaveAsync(row, EntityTypes.Subject, row.Id);
        return row;
    }

    // Insert or update; stamps UpdatedAt.
    public Task SaveTransactionAsync(TransactionRow row)
    {
        row.UpdatedAt = NowMs();
        return SaveAsync(row, EntityTypes.Transaction, row.Id);
    }

    // Soft delete, so the deletion syncs like any other edit.
    public async Task DeleteTransactionAsync(Guid id)
    {
        await InitAsync();
        if (await _db.FindAsync<TransactionRow>(id) is not { } row) return;
        row.IsDeleted = true;
        await SaveTransactionAsync(row);
    }

    // ---------- Reads ----------

    public async Task<TransactionRow?> GetTransactionAsync(Guid id)
    {
        await InitAsync();
        return await _db.FindAsync<TransactionRow>(id);
    }

    // Live categories with their live subjects, alphabetical — for pickers.
    public async Task<List<Category>> GetCategoriesAsync()
    {
        await InitAsync();
        var classes = await _db.Table<ClassRow>().Where(c => !c.IsDeleted).ToListAsync();
        var subjects = await _db.Table<SubjectRow>().Where(s => !s.IsDeleted).ToListAsync();
        return classes
            .OrderBy(c => c.Name, StringComparer.OrdinalIgnoreCase)
            .Select(c => new Category(c, subjects.Where(s => s.ClassId == c.Id)
                .OrderBy(s => s.Name, StringComparer.OrdinalIgnoreCase).ToList()))
            .ToList();
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
            items.Add(new TransactionItem(t.Id, c.Id, s.Id, s.Name, c.Name, c.ColorHex, t.Amount, t.Note, Utc(t.OccurredAt)));
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
