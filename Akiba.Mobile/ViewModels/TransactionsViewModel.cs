using System.Collections.ObjectModel;
using System.Globalization;
using Akiba.Mobile.Services;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;

namespace Akiba.Mobile.ViewModels;

public record TransactionRowView(Guid Id, string Title, string Subtitle, string AmountText, Color AmountColor, Color DotColor, string DateText);

public partial class TransactionsViewModel : ObservableObject
{
    private static readonly Color Income = Color.FromArgb("#4FAE8E");
    private static readonly Color Expense = Color.FromArgb("#C1583D");

    private readonly LocalDb _db;
    private readonly SyncService _sync;

    public ObservableCollection<TransactionRowView> Items { get; } = [];

    [ObservableProperty] public partial string Status { get; set; }
    [ObservableProperty] public partial bool IsRefreshing { get; set; }

    public TransactionsViewModel(LocalDb db, SyncService sync)
    {
        _db = db;
        _sync = sync;
        Status = "";
        _sync.DataChanged += () => _ = LoadAsync();
    }

    public async Task LoadAsync()
    {
        var txns = await _db.GetTransactionsAsync();
        var pending = await _sync.PendingCountAsync();
        Items.Clear();
        foreach (var t in txns)
        {
            Items.Add(new TransactionRowView(
                t.Id,
                t.SubjectName,
                string.IsNullOrWhiteSpace(t.Note) ? t.ClassName : $"{t.ClassName} · {t.Note}",
                Format.SignedMoney(t.Amount),
                t.Amount < 0 ? Expense : Income,
                Color.FromArgb(t.ColorHex),
                // The stored UTC date is the calendar day that was picked — show it as-is.
                t.OccurredAt.ToString("d MMM yyyy", CultureInfo.InvariantCulture)));
        }
        Status = Format.SyncStatus(_sync.LastResult, _sync.LastSyncedAt, pending);
    }

    [RelayCommand]
    private async Task RefreshAsync()
    {
        try
        {
            await _sync.SyncAsync();
            await LoadAsync();
        }
        finally
        {
            IsRefreshing = false;
        }
    }
}
