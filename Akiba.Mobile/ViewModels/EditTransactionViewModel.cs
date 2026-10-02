using System.Collections.ObjectModel;
using System.Globalization;
using Akiba.Mobile.Models;
using Akiba.Mobile.Services;
using CommunityToolkit.Mvvm.ComponentModel;

namespace Akiba.Mobile.ViewModels;

// Picker rows. A null value is the "+ New …" entry. ToString is what the
// Picker displays.
public record CategoryOption(Category? Category)
{
    public override string ToString() => Category?.Class.Name ?? "+ New category…";
}

public record SubjectOption(SubjectRow? Subject)
{
    public override string ToString() => Subject?.Name ?? "+ New subject…";
}

// Add or edit one transaction — same rules as the web form: pick or create a
// category, pick or create a subject, amount, note, date. Works fully
// offline: everything is written to LocalDb and queued for sync.
public partial class EditTransactionViewModel : ObservableObject
{
    // Same palette as the web app; a new category takes the next color.
    private static readonly string[] Palette = ["#4FAE8E", "#C9A227", "#C1583D", "#7C93C4", "#B36FB0", "#4F9DAE"];
    private static readonly Color Gold = Color.FromArgb("#C9A227");
    private static readonly Color Line = Color.FromArgb("#2A3A30");

    private TransactionRow? _editing;
    private int _categoryCount;

    public ObservableCollection<CategoryOption> CategoryOptions { get; } = [];
    public ObservableCollection<SubjectOption> SubjectOptions { get; } = [];

    [ObservableProperty] public partial string Title { get; set; }
    [ObservableProperty] public partial bool IsEditing { get; set; }
    [ObservableProperty] public partial bool IsExpense { get; set; }
    [ObservableProperty] public partial CategoryOption? SelectedCategory { get; set; }
    [ObservableProperty] public partial SubjectOption? SelectedSubject { get; set; }
    [ObservableProperty] public partial bool IsNewCategory { get; set; }
    [ObservableProperty] public partial bool IsNewSubject { get; set; }
    [ObservableProperty] public partial bool ShowSubjectPicker { get; set; }
    [ObservableProperty] public partial string NewCategoryName { get; set; }
    [ObservableProperty] public partial string NewCategoryLimit { get; set; }
    [ObservableProperty] public partial string NewSubjectName { get; set; }
    [ObservableProperty] public partial string Amount { get; set; }
    [ObservableProperty] public partial string Note { get; set; }
    [ObservableProperty] public partial DateTime? Date { get; set; }
    [ObservableProperty] public partial string Error { get; set; }

    private readonly LocalDb _db;
    private readonly SyncService _sync;
    private readonly AuthService _auth;

    public EditTransactionViewModel(LocalDb db, SyncService sync, AuthService auth)
    {
        _db = db;
        _sync = sync;
        _auth = auth;
        Title = "Add transaction";
        IsExpense = true;
        NewCategoryName = "";
        NewCategoryLimit = "";
        NewSubjectName = "";
        Amount = "";
        Note = "";
        Date = DateTime.Today;
        Error = "";
    }

    public Color ExpenseBorder => IsExpense ? Gold : Line;
    public Color IncomeBorder => IsExpense ? Line : Gold;

    partial void OnIsExpenseChanged(bool value)
    {
        OnPropertyChanged(nameof(ExpenseBorder));
        OnPropertyChanged(nameof(IncomeBorder));
    }

    partial void OnSelectedCategoryChanged(CategoryOption? value)
    {
        IsNewCategory = value is { Category: null };
        SubjectOptions.Clear();
        if (value?.Category is { } cat)
        {
            foreach (var s in cat.Subjects) SubjectOptions.Add(new SubjectOption(s));
            SubjectOptions.Add(new SubjectOption(null));
        }
        SelectedSubject = null;
        // A brand-new category gets its first subject from the text box instead.
        ShowSubjectPicker = value?.Category is not null;
        IsNewSubject = IsNewCategory;
    }

    partial void OnSelectedSubjectChanged(SubjectOption? value) =>
        IsNewSubject = IsNewCategory || value is { Subject: null };

    // id = null to add; isExpense presets the type for a new entry.
    public async Task InitAsync(Guid? id, bool isExpense)
    {
        var categories = await _db.GetCategoriesAsync();
        _categoryCount = categories.Count;
        CategoryOptions.Clear();
        foreach (var c in categories) CategoryOptions.Add(new CategoryOption(c));
        CategoryOptions.Add(new CategoryOption(null));

        _editing = id is { } existingId ? await _db.GetTransactionAsync(existingId) : null;
        IsEditing = _editing is not null;
        if (_editing is { } t)
        {
            Title = "Edit transaction";
            IsExpense = t.Amount < 0;
            Amount = Math.Abs(t.Amount).ToString(CultureInfo.InvariantCulture);
            Note = t.Note ?? "";
            Date = DateTime.SpecifyKind(t.OccurredAt, DateTimeKind.Utc).Date; // the stored calendar day
            SelectedCategory = CategoryOptions.FirstOrDefault(o => o.Category?.Subjects.Any(s => s.Id == t.SubjectId) == true);
            SelectedSubject = SubjectOptions.FirstOrDefault(o => o.Subject?.Id == t.SubjectId);
        }
        else
        {
            IsExpense = isExpense;
        }
    }

    // Returns true when saved; on a validation problem sets Error instead.
    public async Task<bool> SaveAsync()
    {
        Error = "";
        if (SelectedCategory is null) return Fail("Pick a category.");
        if (IsNewCategory && string.IsNullOrWhiteSpace(NewCategoryName)) return Fail("Name the new category.");
        if (!IsNewCategory && SelectedSubject is null) return Fail("Pick or add a subject.");
        if (IsNewSubject && string.IsNullOrWhiteSpace(NewSubjectName))
            return Fail(IsNewCategory ? "A new category needs a first subject." : "Name the new subject.");
        if (!TryParseAmount(Amount, out var amount) || amount <= 0) return Fail("Enter an amount greater than zero.");
        if (Date is null) return Fail("Pick a date.");

        var classId = SelectedCategory.Category?.Class.Id;
        if (IsNewCategory)
        {
            TryParseAmount(NewCategoryLimit, out var limit);
            var cls = await _db.CreateClassAsync(_auth.UserId, NewCategoryName.Trim(),
                Palette[_categoryCount % Palette.Length], Math.Max(0, limit));
            classId = cls.Id;
        }

        var subjectId = SelectedSubject?.Subject?.Id;
        if (IsNewSubject) subjectId = (await _db.CreateSubjectAsync(classId!.Value, NewSubjectName.Trim())).Id;

        var row = _editing ?? new TransactionRow { Id = Guid.NewGuid(), UserId = _auth.UserId };
        row.SubjectId = subjectId!.Value;
        row.Amount = IsExpense ? -amount : amount;
        row.Note = string.IsNullOrWhiteSpace(Note) ? null : Note.Trim();
        // The picked calendar day at UTC midnight — same convention as the web app.
        row.OccurredAt = new DateTime(Date.Value.Year, Date.Value.Month, Date.Value.Day, 0, 0, 0, DateTimeKind.Utc);
        await _db.SaveTransactionAsync(row);

        _sync.NotifyLocalChange();
        return true;
    }

    public async Task DeleteAsync()
    {
        if (_editing is null) return;
        await _db.DeleteTransactionAsync(_editing.Id);
        _sync.NotifyLocalChange();
    }

    private bool Fail(string message)
    {
        Error = message;
        return false;
    }

    // Accepts "1,250.50" or "1250.5" regardless of the phone's locale.
    private static bool TryParseAmount(string text, out decimal value) =>
        decimal.TryParse(text?.Replace(",", "").Trim(), NumberStyles.Number, CultureInfo.InvariantCulture, out value);
}
