using System.Security.Claims;
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
            var group = app.MapGroup("/api/goals").WithTags("Goals").RequireAuthorization();

            // GET /api/goals?includePurchased=false
            group.MapGet("/", async (ClaimsPrincipal user, bool? includePurchased, AkibaDbContext db) =>
            {
                var userId = user.GetUserId();

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

            // POST /api/goals — the class must be yours
            group.MapPost("/", async (ClaimsPrincipal user, CreateGoalRequest req, AkibaDbContext db) =>
            {
                var userId = user.GetUserId();

                var classOwned = await db.Classes.AnyAsync(c => c.Id == req.ClassId && c.UserId == userId && !c.IsDeleted);
                if (!classOwned) return Results.BadRequest("Class does not exist.");

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

            // PUT /api/goals/{id} — owner only; covers editing AND marking as purchased
            group.MapPut("/{id:guid}", async (Guid id, ClaimsPrincipal user, UpdateGoalRequest req, AkibaDbContext db) =>
            {
                var userId = user.GetUserId();
                var entity = await db.Goals.FirstOrDefaultAsync(g => g.Id == id && g.UserId == userId);
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

            // DELETE /api/goals/{id} — soft delete, owner only
            group.MapDelete("/{id:guid}", async (Guid id, ClaimsPrincipal user, AkibaDbContext db) =>
            {
                var userId = user.GetUserId();
                var entity = await db.Goals.FirstOrDefaultAsync(g => g.Id == id && g.UserId == userId);
                if (entity is null) return Results.NotFound();

                entity.IsDeleted = true;
                entity.UpdatedAt = DateTime.UtcNow;
                await db.SaveChangesAsync();
                return Results.NoContent();
            });
        }
    }
}