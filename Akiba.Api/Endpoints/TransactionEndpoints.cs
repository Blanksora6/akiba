using System.Security.Claims;
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
            var group = app.MapGroup("/api/transactions").WithTags("Transactions").RequireAuthorization();

            // GET /api/transactions?fromDate={date}&toDate={date}
            // fromDate/toDate are optional — omit both to get everything.
            group.MapGet("/", async (ClaimsPrincipal user, DateTime? fromDate, DateTime? toDate, AkibaDbContext db) =>
            {
                var userId = user.GetUserId();

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

            // POST /api/transactions — the subject must belong to one of YOUR classes
            group.MapPost("/", async (ClaimsPrincipal user, CreateTransactionRequest req, AkibaDbContext db) =>
            {
                var userId = user.GetUserId();

                var subjectOwned = await (
                    from s in db.Subjects
                    join c in db.Classes on s.ClassId equals c.Id
                    where s.Id == req.SubjectId && c.UserId == userId && !s.IsDeleted
                    select s.Id).AnyAsync();
                if (!subjectOwned) return Results.BadRequest("Subject does not exist.");

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

            // PUT /api/transactions/{id} — owner only, and the NEW subject must also be yours
            group.MapPut("/{id:guid}", async (Guid id, ClaimsPrincipal user, UpdateTransactionRequest req, AkibaDbContext db) =>
            {
                var userId = user.GetUserId();

                var entity = await db.Transactions.FirstOrDefaultAsync(t => t.Id == id && t.UserId == userId);
                if (entity is null || entity.IsDeleted) return Results.NotFound();

                var subjectOwned = await (
                    from s in db.Subjects
                    join c in db.Classes on s.ClassId equals c.Id
                    where s.Id == req.SubjectId && c.UserId == userId && !s.IsDeleted
                    select s.Id).AnyAsync();
                if (!subjectOwned) return Results.BadRequest("Subject does not exist.");

                entity.SubjectId = req.SubjectId;
                entity.Amount = req.Amount;
                entity.Note = req.Note;
                entity.OccurredAt = req.OccurredAt;
                entity.UpdatedAt = DateTime.UtcNow;
                await db.SaveChangesAsync();
                return Results.NoContent();
            });

            // DELETE /api/transactions/{id} — soft delete, owner only
            group.MapDelete("/{id:guid}", async (Guid id, ClaimsPrincipal user, AkibaDbContext db) =>
            {
                var userId = user.GetUserId();
                var entity = await db.Transactions.FirstOrDefaultAsync(t => t.Id == id && t.UserId == userId);
                if (entity is null) return Results.NotFound();

                entity.IsDeleted = true;
                entity.UpdatedAt = DateTime.UtcNow;
                await db.SaveChangesAsync();
                return Results.NoContent();
            });

            // GET /api/summary/spending?year=2026&month=9
            // Class-level totals only, expenses only — what the pie chart renders.
            app.MapGet("/api/summary/spending", async (ClaimsPrincipal user, int year, int month, AkibaDbContext db) =>
            {
                var userId = user.GetUserId();
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

                // Grouped in memory — the SQLite provider can't translate GroupBy
                // projected into a record constructor. Fine at personal-app scale.
                var result = rawRows
                    .GroupBy(x => new { x.Id, x.Name, x.ColorHex })
                    .Select(g => new SpendingSummaryItem(g.Key.Id, g.Key.Name, g.Key.ColorHex, -g.Sum(x => x.Amount)))
                    .OrderByDescending(x => x.Total)
                    .ToList();

                return Results.Ok(result);
            }).WithTags("Transactions").RequireAuthorization();

            // GET /api/summary/balance — all-time sum, income positive, expenses negative
            app.MapGet("/api/summary/balance", async (ClaimsPrincipal user, AkibaDbContext db) =>
            {
                var userId = user.GetUserId();
                var balance = await db.Transactions
                    .Where(t => t.UserId == userId && !t.IsDeleted)
                    .SumAsync(t => t.Amount);

                return Results.Ok(new { balance });
            }).WithTags("Transactions").RequireAuthorization();
        }
    }
}