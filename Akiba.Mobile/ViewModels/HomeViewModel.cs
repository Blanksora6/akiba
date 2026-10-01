using System.Collections.ObjectModel;
using System.Globalization;
using Akiba.Mobile.Services;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;

namespace Akiba.Mobile.ViewModels;

public record SpendingRow(string Name, Color Color, string AmountText, string LimitText, double Progress, Color BarColor, bool HasLimit);

public partial class HomeViewModel : ObservableObject
{
    private readonly LocalDb _db;
    private readonly SyncService _sync;
    private readonly AuthService _auth;

    public ObservableCollection<SpendingRow> Spending { get; } = [];

    [ObservableProperty] public partial string Greeting { get; set; }
    [ObservableProperty] public partial string Balance { get; set; }
    [ObservableProperty] public partial string MonthLabel { get; set; }
    [ObservableProperty] public partial string Status { get; set; }
    [ObservableProperty] public partial bool IsRefreshing { get; set; }
    [ObservableProperty] public partial bool HasNoSpending { get; set; }

    public HomeViewModel(LocalDb db, SyncService sync, AuthService auth)
    {
        _db = db;
        _sync = sync;
        _auth = auth;
        Greeting = "";
        Balance = "—";
        MonthLabel = "";
        Status = "";
        _sync.DataChanged += () => _ = LoadAsync();
    }

    // Reads only from the local database, so it works offline.
    public async Task LoadAsync()
    {
        var name = _auth.DisplayName;
        Greeting = string.IsNullOrWhiteSpace(name) ? "Hey 👋" : $"Hey {name.Split(' ')[0]} 👋";

        var now = DateTime.Now;
        MonthLabel = $"Spending — {now.ToString("MMMM yyyy", CultureInfo.InvariantCulture)}";
        Balance = Format.Money(await _db.GetBalanceAsync());

        var spending = await _db.GetMonthSpendingAsync(now.Year, now.Month);
        Spending.Clear();
        foreach (var s in spending)
        {
            var color = Color.FromArgb(s.ColorHex);
            var over = s.Limit > 0 && s.Total > s.Limit;
            Spending.Add(new SpendingRow(
                s.ClassName,
                color,
                Format.Money(s.Total),
                s.Limit > 0 ? $"of {Format.Money(s.Limit)}" : "",
                s.Limit > 0 ? (double)Math.Min(1m, s.Total / s.Limit) : 0,
                over ? Color.FromArgb("#C1583D") : color,
                s.Limit > 0));
        }
        HasNoSpending = Spending.Count == 0;
    }

    [RelayCommand]
    private async Task RefreshAsync()
    {
        try
        {
            Status = Format.SyncStatus(await _sync.SyncAsync(), _sync.LastSyncedAt);
            await LoadAsync();
        }
        finally
        {
            IsRefreshing = false;
        }
    }
}
