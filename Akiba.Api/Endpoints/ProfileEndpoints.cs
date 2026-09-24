using Akiba.Data;
using Microsoft.EntityFrameworkCore;

namespace Akiba.Endpoints
{
    public record ProfileDto(string DisplayName, string Email, string? Nickname);
    public record UpdateNicknameRequest(string Nickname);

    public static class ProfileEndpoints
    {
        public static void MapProfileEndpoints(this WebApplication app)
        {
            var group = app.MapGroup("/api/profile").WithTags("Profile");

            // GET /api/profile?userId={id}
            group.MapGet("/", async (Guid userId, AkibaDbContext db) =>
            {
                var user = await db.Users.FindAsync(userId);
                if (user is null) return Results.NotFound();

                return Results.Ok(new ProfileDto(user.DisplayName, user.Email, user.Nickname));
            });

            // PUT /api/profile/nickname?userId={id}
            group.MapPut("/nickname", async (Guid userId, UpdateNicknameRequest req, AkibaDbContext db) =>
            {
                var user = await db.Users.FindAsync(userId);
                if (user is null) return Results.NotFound();

                user.Nickname = string.IsNullOrWhiteSpace(req.Nickname) ? null : req.Nickname.Trim();
                await db.SaveChangesAsync();

                return Results.Ok(new ProfileDto(user.DisplayName, user.Email, user.Nickname));
            });
        }
    }
}