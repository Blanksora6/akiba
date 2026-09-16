using Akiba.Data;
using Akiba.Dtos;
using Akiba.Models;
using Microsoft.EntityFrameworkCore;

namespace Akiba.Endpoints
{
    public static class TransactionEndpoints
    {
        public static void MapTransactionEndpoints(this WebApplication app)
        {
            var group = app.MapGroup("/api/transactions").WithTags("Transactions");

            // GET /api/transactions?userId={id}&fromDate={date}&toDate={date}
            // fromDate/toDate are optional — omit both to get everything (used by the "all transactions" view).
            group.MapGet("/", async (Guid userId, DateTime? fromDate, DateTime? toDate, AkibaDbContext db) =>
            {
                var query =
                    from t in db.Transactions
                    join s in db.Subjects on t.SubjectId equals s.Id
                    join c in db.Classes on s.ClassId equals c.Id
                    where t.UserId == userId && !t.IsDeleted
                    select new { t, s, c };

                if (fromDate.HasValue) query = query.Where(x => x.t.OccurredAt >= fromDate.Value);
                if (toDate.HasValue) query = query.Where(x => x.t.OccurredAt < toDate.Value);

                var result = await query
                    .OrderByDescending(x => x.t.OccurredAt)
                    .Select(x => new TransactionDto(
                        x.t.Id, x.s.Id, x.s.Name, x.c.Id, x.c.Name, x.t.Amount, x.t.Note, x.t.OccurredAt))
                    .ToListAsync();

                return Results.Ok(result);
            });

            // POST /api/transactions?userId={id}
            group.MapPost("/", async (Guid userId, CreateTransactionRequest req, AkibaDbContext db) =>
            {
                var subjectExists = await db.Subjects.AnyAsync(s => s.Id == req.SubjectId && !s.IsDeleted);
                if (!subjectExists) return Results.BadRequest("Subject does not exist.");

                var entity = new Transaction
                {
                    Id = Guid.NewGuid(),
                    UserId = userId,
                    SubjectId = req.SubjectId,
                    Amount = req.Amount,
                    Note = req.Note,
                    OccurredAt = req.OccurredAt,
                    UpdatedAt = DateTime.UtcNow,
                    IsDeleted = false
                };
                db.Transactions.Add(entity);
                await db.SaveChangesAsync();
                return Results.Created($"/api/transactions/{entity.Id}", entity.Id);
            });

            // PUT /api/transactions/{id} — entries can be miscategorized and corrected later,
            // so this is a real edit, not append-only.
            group.MapPut("/{id:guid}", async (Guid id, UpdateTransactionRequest req, AkibaDbContext db) =>
            {
                var entity = await db.Transactions.FindAsync(id);
                if (entity is null || entity.IsDeleted) return Results.NotFound();

                entity.SubjectId = req.SubjectId;
                entity.Amount = req.Amount;
                entity.Note = req.Note;
                entity.OccurredAt = req.OccurredAt;
                entity.UpdatedAt = DateTime.UtcNow;
                await db.SaveChangesAsync();
                return Results.NoContent();
            });

            // DELETE /api/transactions/{id} — soft delete, so a delete made offline
            // can't silently resurrect a row another device edited before it synced.
            group.MapDelete("/{id:guid}", async (Guid id, AkibaDbContext db) =>
            {
                var entity = await db.Transactions.FindAsync(id);
                if (entity is null) return Results.NotFound();

                entity.IsDeleted = true;
                entity.UpdatedAt = DateTime.UtcNow;
                await db.SaveChangesAsync();
                return Results.NoContent();
            });

            // GET /api/summary/spending?userId={id}&year=2026&month=8
            // Class-level totals only, expenses only (negative amounts) — this is exactly
            // what the pie chart on the dashboard renders, no client-side aggregation needed.
            app.MapGet("/api/summary/spending", async (Guid userId, int year, int month, AkibaDbContext db) =>
            {
                var monthStart = new DateTime(year, month, 1);
                var monthEnd = monthStart.AddMonths(1);

                var rawRows = await (
                    from t in db.Transactions
                    join s in db.Subjects on t.SubjectId equals s.Id
                    join c in db.Classes on s.ClassId equals c.Id
                    where t.UserId == userId && !t.IsDeleted
                        && t.Amount < 0
                        && t.OccurredAt >= monthStart && t.OccurredAt < monthEnd
                    select new { c.Id, c.Name, c.ColorHex, t.Amount }
                ).ToListAsync();

                // Grouped in memory, not in SQL — the SQLite provider can't translate
                // GroupBy projected straight into a record constructor. Fine at this
                // scale: a personal app's monthly transaction count is never large
                // enough for this to matter performance-wise.
                var result = rawRows
                    .GroupBy(x => new { x.Id, x.Name, x.ColorHex })
                    .Select(g => new SpendingSummaryItem(g.Key.Id, g.Key.Name, g.Key.ColorHex, -g.Sum(x => x.Amount)))
                    .OrderByDescending(x => x.Total)
                    .ToList();

                return Results.Ok(result);
            }).WithTags("Transactions");

            // GET /api/summary/balance?userId={id}
            // All-time sum across every transaction (income positive, expenses negative).
            // Missing from the original contract — added when the dashboard build revealed
            // there was no endpoint for the single number the Balance Card actually needs.
            app.MapGet("/api/summary/balance", async (Guid userId, AkibaDbContext db) =>
            {
                var balance = await db.Transactions
                    .Where(t => t.UserId == userId && !t.IsDeleted)
                    .SumAsync(t => t.Amount);

                return Results.Ok(new { balance });
            }).WithTags("Transactions");
        }
    }
}