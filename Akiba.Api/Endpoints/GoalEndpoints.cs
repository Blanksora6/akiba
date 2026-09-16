using Akiba.Data;
using Akiba.Dtos;
using Akiba.Models;
using Microsoft.EntityFrameworkCore;

namespace Akiba.Endpoints
{
    public static class GoalEndpoints
    {
        public static void MapGoalEndpoints(this WebApplication app)
        {
            var group = app.MapGroup("/api/goals").WithTags("Goals");

            // GET /api/goals?userId={id}&includePurchased=false
            group.MapGet("/", async (Guid userId, bool? includePurchased, AkibaDbContext db) =>
            {
                var query =
                    from g in db.Goals
                    join c in db.Classes on g.ClassId equals c.Id
                    where g.UserId == userId && !g.IsDeleted
                    select new { g, c };

                if (includePurchased != true)
                    query = query.Where(x => !x.g.IsPurchased);

                var result = await query
                    .Select(x => new GoalDto(
                        x.g.Id, x.c.Id, x.c.Name, x.g.Name, x.g.Price,
                        x.g.TargetDate, x.g.IsRecurring, x.g.IntervalMonths, x.g.IsPurchased))
                    .ToListAsync();

                return Results.Ok(result);
            });

            // POST /api/goals?userId={id}
            group.MapPost("/", async (Guid userId, CreateGoalRequest req, AkibaDbContext db) =>
            {
                var classExists = await db.Classes.AnyAsync(c => c.Id == req.ClassId && !c.IsDeleted);
                if (!classExists) return Results.BadRequest("Class does not exist.");

                if (!req.IsRecurring && req.TargetDate is null)
                    return Results.BadRequest("Provide either a targetDate or mark it recurring with an interval.");
                if (req.IsRecurring && req.IntervalMonths is null)
                    return Results.BadRequest("Recurring goals need intervalMonths set.");

                var entity = new Goal
                {
                    Id = Guid.NewGuid(),
                    UserId = userId,
                    ClassId = req.ClassId,
                    Name = req.Name,
                    Price = req.Price,
                    TargetDate = req.TargetDate,
                    IsRecurring = req.IsRecurring,
                    IntervalMonths = req.IntervalMonths,
                    IsPurchased = false,
                    UpdatedAt = DateTime.UtcNow,
                    IsDeleted = false
                };
                db.Goals.Add(entity);
                await db.SaveChangesAsync();
                return Results.Created($"/api/goals/{entity.Id}", entity.Id);
            });

            // PUT /api/goals/{id} — covers editing details AND marking as purchased
            // (this is the "edit made from whichever device" case that still needs
            // last-write-wins, unlike append-only transactions).
            group.MapPut("/{id:guid}", async (Guid id, UpdateGoalRequest req, AkibaDbContext db) =>
            {
                var entity = await db.Goals.FindAsync(id);
                if (entity is null || entity.IsDeleted) return Results.NotFound();

                entity.Name = req.Name;
                entity.Price = req.Price;
                entity.TargetDate = req.TargetDate;
                entity.IsRecurring = req.IsRecurring;
                entity.IntervalMonths = req.IntervalMonths;
                entity.IsPurchased = req.IsPurchased;
                entity.UpdatedAt = DateTime.UtcNow;
                await db.SaveChangesAsync();
                return Results.NoContent();
            });

            // DELETE /api/goals/{id}
            group.MapDelete("/{id:guid}", async (Guid id, AkibaDbContext db) =>
            {
                var entity = await db.Goals.FindAsync(id);
                if (entity is null) return Results.NotFound();

                entity.IsDeleted = true;
                entity.UpdatedAt = DateTime.UtcNow;
                await db.SaveChangesAsync();
                return Results.NoContent();
            });
        }
    }
}