using SQLite;

namespace Akiba.Mobile.Models;

// Local mirror of the server's tables. The same classes are the sync wire
// format: property names match the camelCase JSON from /api/sync/pull (and
// what /api/sync/push will expect), so rows go straight from JSON to SQLite.
//
// DateTimes are UTC. sqlite-net stores them as ticks and hands them back with
// Kind=Unspecified, so readers treat them as UTC (see LocalDb).

[Table("classes")]
public class ClassRow
{
    [PrimaryKey] public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string Name { get; set; } = "";
    public string ColorHex { get; set; } = "#4FAE8E";
    public decimal MonthlyLimit { get; set; }
    public DateTime UpdatedAt { get; set; }
    public bool IsDeleted { get; set; }
}

[Table("subjects")]
public class SubjectRow
{
    [PrimaryKey] public Guid Id { get; set; }
    [Indexed] public Guid ClassId { get; set; }
    public string Name { get; set; } = "";
    public DateTime UpdatedAt { get; set; }
    public bool IsDeleted { get; set; }
}

// Positive amount = income, negative = expense. OccurredAt is the picked
// calendar day at UTC midnight, same convention as the web app.
[Table("transactions")]
public class TransactionRow
{
    [PrimaryKey] public Guid Id { get; set; }
    public Guid UserId { get; set; }
    [Indexed] public Guid SubjectId { get; set; }
    public decimal Amount { get; set; }
    public string? Note { get; set; }
    public DateTime OccurredAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public bool IsDeleted { get; set; }
}

[Table("goals")]
public class GoalRow
{
    [PrimaryKey] public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid ClassId { get; set; }
    public string Name { get; set; } = "";
    public decimal Price { get; set; }
    public DateTime? TargetDate { get; set; }
    public bool IsRecurring { get; set; }
    public int? IntervalMonths { get; set; }
    public bool IsPurchased { get; set; }
    public DateTime UpdatedAt { get; set; }
    public bool IsDeleted { get; set; }
}

// Small key/value table for sync bookkeeping (e.g. lastPulledAt).
[Table("sync_state")]
public class SyncStateRow
{
    [PrimaryKey] public string Key { get; set; } = "";
    public string Value { get; set; } = "";
}

public class SyncPullResponse
{
    public List<ClassRow> Classes { get; set; } = [];
    public List<SubjectRow> Subjects { get; set; } = [];
    public List<TransactionRow> Transactions { get; set; } = [];
    public List<GoalRow> Goals { get; set; } = [];

    // Kept as the server's own string and sent back verbatim as the next
    // `since`, so no clock or formatting differences creep in.
    public string ServerTime { get; set; } = "";
}
