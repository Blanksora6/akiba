using System.Net.Http.Json;
using Akiba.Mobile.Models;
using Akiba.Mobile.Services;

namespace Akiba.Mobile.Tests;

// Step 6 of the build plan: go offline, log and edit transactions, reconnect,
// and confirm everything lands — including the conflict and delete cases
// that are easy to get subtly wrong. Each test gets its own server and phones.
public class OfflineSyncTests : IAsyncLifetime
{
    private TestServer _server = null!;
    private readonly List<Phone> _phones = [];

    public async Task InitializeAsync() => _server = await TestServer.StartAsync();

    public async Task DisposeAsync()
    {
        foreach (var p in _phones) p.Dispose();
        await _server.DisposeAsync();
    }

    private Phone NewPhone()
    {
        var phone = new Phone(_server);
        _phones.Add(phone);
        return phone;
    }

    private static TransactionRow Expense(Guid subjectId, decimal amount, string? note = null) => new()
    {
        Id = Guid.NewGuid(),
        SubjectId = subjectId,
        Amount = -amount,
        Note = note,
        OccurredAt = new DateTime(2026, 10, 1, 0, 0, 0, DateTimeKind.Utc),
    };

    // A phone with one category + subject, synced to the server.
    private async Task<(Phone Phone, SubjectRow Subject, ClassRow Class)> SyncedPhoneWithCategoryAsync()
    {
        var phone = NewPhone();
        var cls = await phone.Db.CreateClassAsync(Guid.Empty, "Food", "#4FAE8E", 10000);
        var subject = await phone.Db.CreateSubjectAsync(cls.Id, "Lunch");
        await phone.SyncAsync();
        return (phone, subject, cls);
    }

    [Fact]
    public async Task Offline_entries_edits_and_deletes_all_land_after_reconnecting()
    {
        var phone = NewPhone();
        phone.Network.Online = false;

        // Everything created with no connection at all — category included.
        var cls = await phone.Db.CreateClassAsync(Guid.Empty, "Transport", "#C9A227", 6000);
        var subject = await phone.Db.CreateSubjectAsync(cls.Id, "Matatu");
        var bus = Expense(subject.Id, 100, "to town");
        var uber = Expense(subject.Id, 650);
        var mistake = Expense(subject.Id, 9999);
        foreach (var t in new[] { bus, uber, mistake }) await phone.Db.SaveTransactionAsync(t);

        bus.Amount = -120; // fixed the fare
        await phone.Db.SaveTransactionAsync(bus);
        await phone.Db.DeleteTransactionAsync(mistake.Id);

        await Assert.ThrowsAsync<HttpRequestException>(phone.SyncAsync);
        Assert.Equal(5, await phone.Db.PendingCountAsync()); // class, subject, 3 transactions — edits collapsed
        Assert.Equal(-770m, await phone.Db.GetBalanceAsync()); // usable offline

        phone.Network.Online = true;
        await phone.SyncAsync();
        Assert.Equal(0, await phone.Db.PendingCountAsync());

        // The web app sees exactly the final state.
        var onServer = await _server.Web().TransactionsAsync();
        Assert.Equal(2, onServer.Count);
        Assert.Contains(onServer, t => t.GetProperty("id").GetGuid() == bus.Id && t.GetProperty("amount").GetDecimal() == -120);
        Assert.DoesNotContain(onServer, t => t.GetProperty("id").GetGuid() == mistake.Id);

        // A second phone signing in gets the same picture.
        var other = NewPhone();
        await other.SyncAsync();
        Assert.Equal(-770m, await other.Db.GetBalanceAsync());
        Assert.Equal(2, (await other.Db.GetTransactionsAsync()).Count);
    }

    [Fact]
    public async Task A_newer_edit_elsewhere_beats_an_older_offline_edit()
    {
        var (a, subject, _) = await SyncedPhoneWithCategoryAsync();
        var txn = Expense(subject.Id, 500);
        await a.Db.SaveTransactionAsync(txn);
        await a.SyncAsync();
        var b = NewPhone();
        await b.SyncAsync();

        // A edits offline first...
        a.Network.Online = false;
        var mine = (await a.Db.GetTransactionAsync(txn.Id))!;
        mine.Amount = -111;
        await a.Db.SaveTransactionAsync(mine);
        await Task.Delay(20);

        // ...then B edits the same transaction later, online.
        var theirs = (await b.Db.GetTransactionAsync(txn.Id))!;
        theirs.Amount = -222;
        await b.Db.SaveTransactionAsync(theirs);
        await b.SyncAsync();

        // A reconnects: its older edit loses, and A ends up showing B's.
        a.Network.Online = true;
        await a.SyncAsync();
        Assert.Equal(-222m, (await a.Db.GetTransactionAsync(txn.Id))!.Amount);
        Assert.Equal(0, await a.Db.PendingCountAsync());
        Assert.Equal(-222m, (await _server.Web().TransactionsAsync()).Single().GetProperty("amount").GetDecimal());
    }

    [Fact]
    public async Task A_newer_offline_edit_beats_an_older_edit_elsewhere()
    {
        var (a, subject, _) = await SyncedPhoneWithCategoryAsync();
        var txn = Expense(subject.Id, 500);
        await a.Db.SaveTransactionAsync(txn);
        await a.SyncAsync();
        var b = NewPhone();
        await b.SyncAsync();

        var theirs = (await b.Db.GetTransactionAsync(txn.Id))!;
        theirs.Amount = -222;
        await b.Db.SaveTransactionAsync(theirs);
        await b.SyncAsync();
        await Task.Delay(20);

        a.Network.Online = false;
        var mine = (await a.Db.GetTransactionAsync(txn.Id))!;
        mine.Amount = -333;
        await a.Db.SaveTransactionAsync(mine);

        a.Network.Online = true;
        await a.SyncAsync();
        await b.SyncAsync();
        Assert.Equal(-333m, (await a.Db.GetTransactionAsync(txn.Id))!.Amount);
        Assert.Equal(-333m, (await b.Db.GetTransactionAsync(txn.Id))!.Amount);
    }

    [Fact]
    public async Task An_edit_pushed_hours_late_still_reaches_a_phone_that_synced_in_between()
    {
        var (a, subject, _) = await SyncedPhoneWithCategoryAsync();
        var b = NewPhone();
        await b.SyncAsync(); // B's cursor is now "after" A's offline edit below

        a.Network.Online = false;
        a.ClockOffset = TimeSpan.FromHours(-5); // edit made long ago, phone offline since
        var late = Expense(subject.Id, 300);
        await a.Db.SaveTransactionAsync(late);
        a.ClockOffset = TimeSpan.Zero;
        await b.SyncAsync();

        a.Network.Online = true;
        await a.SyncAsync();
        await b.SyncAsync();
        Assert.NotNull(await b.Db.GetTransactionAsync(late.Id));
    }

    [Fact]
    public async Task Deleting_a_category_on_the_web_removes_its_transactions_from_the_phone()
    {
        var (phone, subject, cls) = await SyncedPhoneWithCategoryAsync();
        await phone.Db.SaveTransactionAsync(Expense(subject.Id, 400));
        await phone.SyncAsync();
        Assert.Equal(-400m, await phone.Db.GetBalanceAsync());

        (await _server.Web().DeleteAsync($"/api/classes/{cls.Id}")).EnsureSuccessStatusCode();
        await phone.SyncAsync();

        Assert.Equal(0m, await phone.Db.GetBalanceAsync());
        Assert.Empty(await phone.Db.GetTransactionsAsync());
        Assert.Empty(await phone.Db.GetCategoriesAsync());
    }

    [Fact]
    public async Task Web_entries_reach_the_phone()
    {
        var (phone, subject, _) = await SyncedPhoneWithCategoryAsync();
        var res = await _server.Web().PostAsJsonAsync("/api/transactions",
            new { subjectId = subject.Id, amount = 2500, note = "salary", occurredAt = "2026-10-01T00:00:00Z" });
        res.EnsureSuccessStatusCode();

        await phone.SyncAsync();
        var item = Assert.Single(await phone.Db.GetTransactionsAsync());
        Assert.Equal(2500m, item.Amount);
        Assert.Equal("salary", item.Note);
    }

    [Fact]
    public async Task A_pull_never_overwrites_a_newer_pending_local_edit()
    {
        var (phone, subject, _) = await SyncedPhoneWithCategoryAsync();
        var txn = Expense(subject.Id, 50);
        await phone.Db.SaveTransactionAsync(txn);
        await phone.SyncAsync();

        var serverCopy = (await phone.Db.GetTransactionAsync(txn.Id))!;
        var olderServerVersion = Clone(serverCopy, amount: -1, updatedAt: serverCopy.UpdatedAt);
        await Task.Delay(20);
        serverCopy.Amount = -75;
        await phone.Db.SaveTransactionAsync(serverCopy); // pending, newer

        await phone.Db.ApplyServerRowsAsync(new SyncChanges { Transactions = [olderServerVersion] });
        Assert.Equal(-75m, (await phone.Db.GetTransactionAsync(txn.Id))!.Amount);
        Assert.Equal(1, await phone.Db.PendingCountAsync());

        var newerServerVersion = Clone(serverCopy, amount: -99, updatedAt: DateTime.UtcNow.AddMinutes(1));
        await phone.Db.ApplyServerRowsAsync(new SyncChanges { Transactions = [newerServerVersion] });
        Assert.Equal(-99m, (await phone.Db.GetTransactionAsync(txn.Id))!.Amount);
        Assert.Equal(0, await phone.Db.PendingCountAsync()); // our edit lost, so it's no longer pending
    }

    [Fact]
    public async Task An_edit_made_while_a_push_is_in_flight_stays_queued()
    {
        var (phone, subject, _) = await SyncedPhoneWithCategoryAsync();
        var txn = Expense(subject.Id, 50);
        await phone.Db.SaveTransactionAsync(txn);

        var (maxId, _) = await phone.Db.GetPendingAsync(); // push starts...
        txn.Amount = -60;
        await phone.Db.SaveTransactionAsync(txn);          // ...user edits again...
        await phone.Db.ClearOutboxUpToAsync(maxId);        // ...push finishes

        Assert.Equal(1, await phone.Db.PendingCountAsync());
        await phone.SyncAsync();
        Assert.Equal(-60m, (await _server.Web().TransactionsAsync()).Single().GetProperty("amount").GetDecimal());
    }

    private static TransactionRow Clone(TransactionRow t, decimal amount, DateTime updatedAt) => new()
    {
        Id = t.Id, UserId = t.UserId, SubjectId = t.SubjectId, Amount = amount, Note = t.Note,
        OccurredAt = t.OccurredAt, UpdatedAt = updatedAt, IsDeleted = t.IsDeleted,
    };
}
