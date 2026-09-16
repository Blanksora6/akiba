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
			var group = app.MapGroup("/api/classes").WithTags("Classes");

			// GET /api/classes?userId={id}
			// TODO: once auth is wired in, replace the userId query param with a JWT claim.
			group.MapGet("/", async (Guid userId, AkibaDbContext db) =>
			{
				var classes = await db.Classes
					.Where(c => c.UserId == userId && !c.IsDeleted)
					.Select(c => new ClassDto(
						c.Id, c.Name, c.ColorHex, c.MonthlyLimit,
						db.Subjects.Where(s => s.ClassId == c.Id && !s.IsDeleted)
							.Select(s => new SubjectDto(s.Id, s.Name)).ToList()))
					.ToListAsync();

				return Results.Ok(classes);
			});

			// POST /api/classes?userId={id}
			group.MapPost("/", async (Guid userId, CreateClassRequest req, AkibaDbContext db) =>
			{
				var entity = new ExpenseClass
				{
					Id = Guid.NewGuid(),
					UserId = userId,
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

			// PUT /api/classes/{id}
			group.MapPut("/{id:guid}", async (Guid id, UpdateClassRequest req, AkibaDbContext db) =>
			{
				var entity = await db.Classes.FindAsync(id);
				if (entity is null || entity.IsDeleted) return Results.NotFound();

				entity.Name = req.Name;
				entity.ColorHex = req.ColorHex;
				entity.MonthlyLimit = req.MonthlyLimit;
				entity.UpdatedAt = DateTime.UtcNow;
				await db.SaveChangesAsync();
				return Results.NoContent();
			});

			// DELETE /api/classes/{id} — soft delete, never remove the row
			group.MapDelete("/{id:guid}", async (Guid id, AkibaDbContext db) =>
			{
				var entity = await db.Classes.FindAsync(id);
				if (entity is null) return Results.NotFound();

				entity.IsDeleted = true;
				entity.UpdatedAt = DateTime.UtcNow;
				await db.SaveChangesAsync();
				return Results.NoContent();
			});

			// POST /api/classes/{classId}/subjects
			group.MapPost("/{classId:guid}/subjects", async (Guid classId, CreateSubjectRequest req, AkibaDbContext db) =>
			{
				var parentExists = await db.Classes.AnyAsync(c => c.Id == classId && !c.IsDeleted);
				if (!parentExists) return Results.NotFound("Class does not exist.");

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

			// PUT /api/subjects/{id} — separate top-level route since subjects are edited independently
			app.MapPut("/api/subjects/{id:guid}", async (Guid id, UpdateSubjectRequest req, AkibaDbContext db) =>
			{
				var entity = await db.Subjects.FindAsync(id);
				if (entity is null || entity.IsDeleted) return Results.NotFound();

				entity.Name = req.Name;
				entity.UpdatedAt = DateTime.UtcNow;
				await db.SaveChangesAsync();
				return Results.NoContent();
			}).WithTags("Classes");

			// DELETE /api/subjects/{id}
			app.MapDelete("/api/subjects/{id:guid}", async (Guid id, AkibaDbContext db) =>
			{
				var entity = await db.Subjects.FindAsync(id);
				if (entity is null) return Results.NotFound();

				entity.IsDeleted = true;
				entity.UpdatedAt = DateTime.UtcNow;
				await db.SaveChangesAsync();
				return Results.NoContent();
			}).WithTags("Classes");
		}
	}
}