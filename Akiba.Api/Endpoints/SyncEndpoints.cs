using System.Security.Claims;
using Akiba.Data;
using Akiba.Models;
using Microsoft.EntityFrameworkCore;

namespace Akiba.Endpoints
{
    // Wire format for sync deliberately reuses the EF entities directly rather than
    // dedicated DTOs — this endpoint only talks to your own clients (the phone app's
    // local SQLite and this server), so the usual "don't expose entities" rule is
    // relaxed here on purpose.
    public record SyncPushRequest(
        List<ExpenseClass> Classes,
        List<Subject> Subjects,
        List<Transaction> Transactions,
        List<Goal> Goals);

    public record SyncPullResponse(
        List<ExpenseClass> Classes,
        List<Subject> Subjects,
        List<Transaction> Transactions,
        List<Goal> Goals,
        DateTime ServerTime);

    public static class SyncEndpoints
    {
        public static void MapSyncEndpoints(this WebApplication app)
        {
            var group = app.MapGroup("/api/sync").WithTags("Sync").RequireAuthorization();

            // GET /api/sync/pull?since={ISO8601 timestamp}
            // Returns everything of YOURS changed since `since`, INCLUDING soft-deleted
            // rows — the phone needs those to know what to remove locally.
            // Pass DateTime.MinValue as `since` for a first-time full sync.
            group.MapGet("/pull", async (ClaimsPrincipal user, DateTime since, AkibaDbContext db) =>
            {
                var userId = user.GetUserId();
                var serverTime = DateTime.UtcNow;

                var classes = await db.Classes
                    .Where(c => c.UserId == userId && c.UpdatedAt > since)
                    .ToListAsync();

                var classIds = await db.Classes
                    .Where(c => c.UserId == userId)
                    .Select(c => c.Id)
                    .ToListAsync();

                var subjects = await db.Subjects
                    .Where(s => classIds.Contains(s.ClassId) && s.UpdatedAt > since)
                    .ToListAsync();

                var transactions = await db.Transactions
                    .Where(t => t.UserId == userId && t.UpdatedAt > since)
                    .ToListAsync();

                var goals = await db.Goals
                    .Where(g => g.UserId == userId && g.UpdatedAt > since)
                    .ToListAsync();

                return Results.Ok(new SyncPullResponse(classes, subjects, transactions, goals, serverTime));
            });

            // POST /api/sync/push
            // Last-write-wins by UpdatedAt, per record. Every incoming record is checked
            // against what the caller actually owns: a record whose ID already exists
            // under someone else's account is skipped, and anything pointing at a class
            // or subject the caller doesn't own is skipped. Skipped records are ignored
            // rather than failing the whole batch.
            group.MapPost("/push", async (ClaimsPrincipal user, SyncPushRequest req, AkibaDbContext db) =>
            {
                var userId = user.GetUserId();

                var userClassIds = await db.Classes
                    .Where(c => c.UserId == userId)
                    .Select(c => c.Id)
                    .ToListAsync();
                var allowedClassIds = new HashSet<Guid>(userClassIds);

                var allowedSubjectIds = new HashSet<Guid>(
                    await db.Subjects
                        .Where(s => userClassIds.Contains(s.ClassId))
                        .Select(s => s.Id)
                        .ToListAsync());

                foreach (var incoming in req.Classes)
                {
                    incoming.UserId = userId; // never trust the client's claimed owner
                    var existing = await db.Classes.FindAsync(incoming.Id);
                    if (existing is null)
                    {
                        db.Classes.Add(incoming);
                        allowedClassIds.Add(incoming.Id);
                    }
                    else if (existing.UserId != userId) continue;
                    else if (incoming.UpdatedAt > existing.UpdatedAt)
                        db.Entry(existing).CurrentValues.SetValues(incoming);
                }

                foreach (var incoming in req.Subjects)
                {
                    if (!allowedClassIds.Contains(incoming.ClassId)) continue;
                    var existing = await db.Subjects.FindAsync(incoming.Id);
                    if (existing is null)
                    {
                        db.Subjects.Add(incoming);
                        allowedSubjectIds.Add(incoming.Id);
                    }
                    else if (!allowedSubjectIds.Contains(existing.Id)) continue;
                    else if (incoming.UpdatedAt > existing.UpdatedAt)
                        db.Entry(existing).CurrentValues.SetValues(incoming);
                }

                foreach (var incoming in req.Transactions)
                {
                    if (!allowedSubjectIds.Contains(incoming.SubjectId)) continue;
                    incoming.UserId = userId;
                    var existing = await db.Transactions.FindAsync(incoming.Id);
                    if (existing is null) db.Transactions.Add(incoming);
                    else if (existing.UserId != userId) continue;
                    else if (incoming.UpdatedAt > existing.UpdatedAt)
                        db.Entry(existing).CurrentValues.SetValues(incoming);
                }

                foreach (var incoming in req.Goals)
                {
                    if (!allowedClassIds.Contains(incoming.ClassId)) continue;
                    incoming.UserId = userId;
                    var existing = await db.Goals.FindAsync(incoming.Id);
                    if (existing is null) db.Goals.Add(incoming);
                    else if (existing.UserId != userId) continue;
                    else if (incoming.UpdatedAt > existing.UpdatedAt)
                        db.Entry(existing).CurrentValues.SetValues(incoming);
                }

                await db.SaveChangesAsync();
                return Results.Ok(new { serverTime = DateTime.UtcNow });
            });
        }
    }
}