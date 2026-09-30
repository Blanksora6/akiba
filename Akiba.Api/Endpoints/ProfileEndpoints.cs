using System.Security.Claims;
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
            var group = app.MapGroup("/api/profile").WithTags("Profile").RequireAuthorization();

            // GET /api/profile
            group.MapGet("/", async (ClaimsPrincipal user, AkibaDbContext db) =>
            {
                var appUser = await db.Users.FindAsync(user.GetUserId());
                if (appUser is null) return Results.NotFound();

                return Results.Ok(new ProfileDto(appUser.DisplayName, appUser.Email, appUser.Nickname));
            });

            // PUT /api/profile/nickname
            group.MapPut("/nickname", async (ClaimsPrincipal user, UpdateNicknameRequest req, AkibaDbContext db) =>
            {
                var appUser = await db.Users.FindAsync(user.GetUserId());
                if (appUser is null) return Results.NotFound();

                appUser.Nickname = string.IsNullOrWhiteSpace(req.Nickname) ? null : req.Nickname.Trim();
                await db.SaveChangesAsync();

                return Results.Ok(new ProfileDto(appUser.DisplayName, appUser.Email, appUser.Nickname));
            });
        }
    }
}