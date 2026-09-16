using Akiba.Data;
using Akiba.Models;
using Microsoft.EntityFrameworkCore;

namespace Akiba.Endpoints
{
    // Wire format for sync deliberately reuses the EF entities directly rather than
    // dedicated DTOs — this endpoint only ever talks to your own two clients (MAUI
    // phone app's local SQLite, and this server), not third parties, so the usual
    // "don't expose entities over the wire" rule is relaxed here on purpose.
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
            var group = app.MapGroup("/api/sync").WithTags("Sync");

            // GET /api/sync/pull?userId={id}&since={ISO8601 timestamp}
            // Returns everything changed since `since`, INCLUDING soft-deleted rows —
            // the phone needs those to know what to remove from its local copy.
            // Pass DateTime.MinValue as `since` for a first-time full sync.
            group.MapGet("/pull", async (Guid userId, DateTime since, AkibaDbContext db) =>
            {
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

            // POST /api/sync/push?userId={id}
            // Last-write-wins by UpdatedAt, applied per record. New records (no existing
            // row) are inserted outright. This never hard-deletes — IsDeleted is just
            // another field that gets overwritten like any other when the incoming
            // record is newer.
            group.MapPost("/push", async (Guid userId, SyncPushRequest req, AkibaDbContext db) =>
            {
                foreach (var incoming in req.Classes)
                {
                    incoming.UserId = userId; // never trust the client's claimed owner
                    var existing = await db.Classes.FindAsync(incoming.Id);
                    if (existing is null) db.Classes.Add(incoming);
                    else if (incoming.UpdatedAt > existing.UpdatedAt)
                        db.Entry(existing).CurrentValues.SetValues(incoming);
                }

                foreach (var incoming in req.Subjects)
                {
                    var existing = await db.Subjects.FindAsync(incoming.Id);
                    if (existing is null) db.Subjects.Add(incoming);
                    else if (incoming.UpdatedAt > existing.UpdatedAt)
                        db.Entry(existing).CurrentValues.SetValues(incoming);
                }

                foreach (var incoming in req.Transactions)
                {
                    incoming.UserId = userId;
                    var existing = await db.Transactions.FindAsync(incoming.Id);
                    if (existing is null) db.Transactions.Add(incoming);
                    else if (incoming.UpdatedAt > existing.UpdatedAt)
                        db.Entry(existing).CurrentValues.SetValues(incoming);
                }

                foreach (var incoming in req.Goals)
                {
                    incoming.UserId = userId;
                    var existing = await db.Goals.FindAsync(incoming.Id);
                    if (existing is null) db.Goals.Add(incoming);
                    else if (incoming.UpdatedAt > existing.UpdatedAt)
                        db.Entry(existing).CurrentValues.SetValues(incoming);
                }

                await db.SaveChangesAsync();
                return Results.Ok(new { serverTime = DateTime.UtcNow });
            });
        }
    }
}