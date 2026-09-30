using System.Security.Claims;
using Akiba.Data;
using Akiba.Dtos;
using Akiba.Models;
using Microsoft.EntityFrameworkCore;

namespace Akiba.Endpoints
{
    public static class ClassEndpoints
    {
        public static void MapClassEndpoints(this WebApplication app)
        {
            var group = app.MapGroup("/api/classes").WithTags("Classes").RequireAuthorization();

            // GET /api/classes
            group.MapGet("/", async (ClaimsPrincipal user, AkibaDbContext db) =>
            {
                var userId = user.GetUserId();

                var classes = await db.Classes
                    .Where(c => c.UserId == userId && !c.IsDeleted)
                    .Select(c => new ClassDto(
                        c.Id, c.Name, c.ColorHex, c.MonthlyLimit,
                        db.Subjects.Where(s => s.ClassId == c.Id && !s.IsDeleted)
                            .Select(s => new SubjectDto(s.Id, s.Name)).ToList()))
                    .ToListAsync();

                return Results.Ok(classes);
            });

            // POST /api/classes
            group.MapPost("/", async (ClaimsPrincipal user, CreateClassRequest req, AkibaDbContext db) =>
            {
                var entity = new ExpenseClass
                {
                    Id = Guid.NewGuid(),
                    UserId = user.GetUserId(),
                    Name = req.Name,
                    ColorHex = req.ColorHex,
                    MonthlyLimit = req.MonthlyLimit,
                    UpdatedAt = DateTime.UtcNow,
                    IsDeleted = false
                };
                db.Classes.Add(entity);
                await db.SaveChangesAsync();
                return Results.Created($"/api/classes/{entity.Id}", entity.Id);
            });

            // PUT /api/classes/{id} — only the owner can edit; anyone else gets 404
            group.MapPut("/{id:guid}", async (Guid id, ClaimsPrincipal user, UpdateClassRequest req, AkibaDbContext db) =>
            {
                var userId = user.GetUserId();
                var entity = await db.Classes.FirstOrDefaultAsync(c => c.Id == id && c.UserId == userId);
                if (entity is null || entity.IsDeleted) return Results.NotFound();

                entity.Name = req.Name;
                entity.ColorHex = req.ColorHex;
                entity.MonthlyLimit = req.MonthlyLimit;
                entity.UpdatedAt = DateTime.UtcNow;
                await db.SaveChangesAsync();
                return Results.NoContent();
            });

            // DELETE /api/classes/{id} — soft delete, owner only
            group.MapDelete("/{id:guid}", async (Guid id, ClaimsPrincipal user, AkibaDbContext db) =>
            {
                var userId = user.GetUserId();
                var entity = await db.Classes.FirstOrDefaultAsync(c => c.Id == id && c.UserId == userId);
                if (entity is null) return Results.NotFound();

                entity.IsDeleted = true;
                entity.UpdatedAt = DateTime.UtcNow;
                await db.SaveChangesAsync();
                return Results.NoContent();
            });

            // POST /api/classes/{classId}/subjects — the parent class must be yours
            group.MapPost("/{classId:guid}/subjects", async (Guid classId, ClaimsPrincipal user, CreateSubjectRequest req, AkibaDbContext db) =>
            {
                var userId = user.GetUserId();
                var parentOwned = await db.Classes.AnyAsync(c => c.Id == classId && c.UserId == userId && !c.IsDeleted);
                if (!parentOwned) return Results.NotFound("Class does not exist.");

                var entity = new Subject
                {
                    Id = Guid.NewGuid(),
                    ClassId = classId,
                    Name = req.Name,
                    UpdatedAt = DateTime.UtcNow,
                    IsDeleted = false
                };
                db.Subjects.Add(entity);
                await db.SaveChangesAsync();
                return Results.Created($"/api/subjects/{entity.Id}", entity.Id);
            });

            // Subjects have no UserId of their own — ownership comes from their class,
            // so every subject edit/delete joins through to check the class owner.
            var subjectGroup = app.MapGroup("/api/subjects").WithTags("Classes").RequireAuthorization();

            subjectGroup.MapPut("/{id:guid}", async (Guid id, ClaimsPrincipal user, UpdateSubjectRequest req, AkibaDbContext db) =>
            {
                var userId = user.GetUserId();
                var entity = await (
                    from s in db.Subjects
                    join c in db.Classes on s.ClassId equals c.Id
                    where s.Id == id && c.UserId == userId
                    select s).FirstOrDefaultAsync();
                if (entity is null || entity.IsDeleted) return Results.NotFound();

                entity.Name = req.Name;
                entity.UpdatedAt = DateTime.UtcNow;
                await db.SaveChangesAsync();
                return Results.NoContent();
            });

            subjectGroup.MapDelete("/{id:guid}", async (Guid id, ClaimsPrincipal user, AkibaDbContext db) =>
            {
                var userId = user.GetUserId();
                var entity = await (
                    from s in db.Subjects
                    join c in db.Classes on s.ClassId equals c.Id
                    where s.Id == id && c.UserId == userId
                    select s).FirstOrDefaultAsync();
                if (entity is null) return Results.NotFound();

                entity.IsDeleted = true;
                entity.UpdatedAt = DateTime.UtcNow;
                await db.SaveChangesAsync();
                return Results.NoContent();
            });
        }
    }
}