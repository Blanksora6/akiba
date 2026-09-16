using System;
using System.Collections.Generic;

namespace Akiba.Dtos
{
    // ----- Classes & Subjects (category structure) -----
    public record SubjectDto(Guid Id, string Name);
    public record ClassDto(Guid Id, string Name, string ColorHex, decimal MonthlyLimit, List<SubjectDto> Subjects);

    public record CreateClassRequest(string Name, string ColorHex, decimal MonthlyLimit);
    public record UpdateClassRequest(string Name, string ColorHex, decimal MonthlyLimit);
    public record CreateSubjectRequest(string Name);
    public record UpdateSubjectRequest(string Name);

    // ----- Transactions -----
    public record TransactionDto(
        Guid Id, Guid SubjectId, string SubjectName, Guid ClassId, string ClassName,
        decimal Amount, string? Note, DateTime OccurredAt);

    public record CreateTransactionRequest(Guid SubjectId, decimal Amount, string? Note, DateTime OccurredAt);
    public record UpdateTransactionRequest(Guid SubjectId, decimal Amount, string? Note, DateTime OccurredAt);

    // ----- Goals (planned purchases) -----
    public record GoalDto(
        Guid Id, Guid ClassId, string ClassName, string Name, decimal Price,
        DateTime? TargetDate, bool IsRecurring, int? IntervalMonths, bool IsPurchased);

    public record CreateGoalRequest(
        Guid ClassId, string Name, decimal Price,
        DateTime? TargetDate, bool IsRecurring, int? IntervalMonths);

    public record UpdateGoalRequest(
        string Name, decimal Price, DateTime? TargetDate,
        bool IsRecurring, int? IntervalMonths, bool IsPurchased);

    // ----- Spending summary (drives the pie chart directly) -----
    public record SpendingSummaryItem(Guid ClassId, string ClassName, string ColorHex, decimal Total);
}