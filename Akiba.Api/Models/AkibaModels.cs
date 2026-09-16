using System;
using System.Collections.Generic;

namespace Akiba.Models
{
    // One row per person using the app. Google OAuth is the only login method,
    // so there's no password hash here — GoogleId is the source of identity.
    public class AppUser
    {
        public Guid Id { get; set; }
        public string GoogleId { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string DisplayName { get; set; } = string.Empty;
        public string Currency { get; set; } = "KES";
        public DateTime CreatedAt { get; set; }
    }

    // The "class" level of the two-tier category system — Groceries, Desktop setup, etc.
    // Expenditure displays at this level by default; subjects only surface on drill-down.
    public class ExpenseClass
    {
        public Guid Id { get; set; }
        public Guid UserId { get; set; }
        public string Name { get; set; } = string.Empty;
        public string ColorHex { get; set; } = "#4FAE8E";
        public decimal MonthlyLimit { get; set; }

        // Sync fields — every editable table needs these for the outbox /
        // last-write-wins policy. IsDeleted is a soft flag: never hard-delete
        // a row that a client might be mid-sync with.
        public DateTime UpdatedAt { get; set; }
        public bool IsDeleted { get; set; }
    }

    // The "subject" level — onions, chips, monitor stand. Always belongs to
    // exactly one class. Individual subject spend is never shown on its own;
    // it only appears when the parent class is expanded.
    public class Subject
    {
        public Guid Id { get; set; }
        public Guid ClassId { get; set; }
        public string Name { get; set; } = string.Empty;

        public DateTime UpdatedAt { get; set; }
        public bool IsDeleted { get; set; }
    }

    // A single logged expense or income entry. Positive amount = income,
    // negative = expense (matches the sign convention already used in the UI mockup).
    // Editable after the fact — "entries can be put in the wrong place" was the
    // reason this needs UpdatedAt/IsDeleted instead of being append-only.
    public class Transaction
    {
        public Guid Id { get; set; }
        public Guid UserId { get; set; }
        public Guid SubjectId { get; set; }
        public decimal Amount { get; set; }
        public string? Note { get; set; }
        public DateTime OccurredAt { get; set; }

        public DateTime UpdatedAt { get; set; }
        public bool IsDeleted { get; set; }
    }

    // Planned purchases — covers both one-off target-date buys (the monitor)
    // and recurring necessities (router every 6 months) in a single model,
    // distinguished by which of TargetDate / IntervalMonths is set.
    public class Goal
    {
        public Guid Id { get; set; }
        public Guid UserId { get; set; }
        public Guid ClassId { get; set; }
        public string Name { get; set; } = string.Empty;
        public decimal Price { get; set; }

        // One-off purchase: set TargetDate, leave IsRecurring false.
        public DateTime? TargetDate { get; set; }

        // Recurring necessity: set IsRecurring true + IntervalMonths, leave TargetDate null.
        public bool IsRecurring { get; set; }
        public int? IntervalMonths { get; set; }

        public bool IsPurchased { get; set; }

        public DateTime UpdatedAt { get; set; }
        public bool IsDeleted { get; set; }
    }
}