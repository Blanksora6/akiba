using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Akiba.Data;
using Akiba.Models;
using Google.Apis.Auth;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

namespace Akiba.Endpoints
{
	public record GoogleSignInRequest(string IdToken);
	public record AuthResponse(string Token, Guid UserId, string Email, string DisplayName);

	public static class AuthEndpoints
	{
		public static void MapAuthEndpoints(this WebApplication app)
		{
			// POST /api/auth/google
			// Client sends the ID token Google Identity Services handed it after
			// sign-in. We verify that token's signature and audience directly
			// against Google's public keys (Google.Apis.Auth does this — no
			// secret needed, that's a different OAuth flow). Once verified, we
			// look up or create the matching AppUser and issue our OWN JWT —
			// the client never talks to Google again after this one call; every
			// future request authenticates against our token, not Google's.
			app.MapPost("/api/auth/google", async (GoogleSignInRequest req, AkibaDbContext db, IConfiguration config) =>
			{
				GoogleJsonWebSignature.Payload payload;
				try
				{
					payload = await GoogleJsonWebSignature.ValidateAsync(req.IdToken, new GoogleJsonWebSignature.ValidationSettings
					{
						Audience = new[] { config["Google:ClientId"] }
					});
				}
				catch (InvalidJwtException)
				{
					return Results.Unauthorized();
				}

				var user = await db.Users.FirstOrDefaultAsync(u => u.GoogleId == payload.Subject);
				if (user is null)
				{
					user = new AppUser
					{
						Id = Guid.NewGuid(),
						GoogleId = payload.Subject,
						Email = payload.Email,
						DisplayName = payload.Name ?? payload.Email,
						Currency = "KES",
						CreatedAt = DateTime.UtcNow
					};
					db.Users.Add(user);
					await db.SaveChangesAsync();
				}

				var token = GenerateJwt(user.Id, config);
				return Results.Ok(new AuthResponse(token, user.Id, user.Email, user.DisplayName));
			}).WithTags("Auth");
		}

		private static string GenerateJwt(Guid userId, IConfiguration config)
		{
			var signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(config["Jwt:SigningKey"]!));
			var credentials = new SigningCredentials(signingKey, SecurityAlgorithms.HmacSha256);
			var expiryMinutes = int.Parse(config["Jwt:ExpiryMinutes"]!);

			var claims = new[] { new Claim(ClaimTypes.NameIdentifier, userId.ToString()) };

			var token = new JwtSecurityToken(
				issuer: config["Jwt:Issuer"],
				audience: config["Jwt:Audience"],
				claims: claims,
				expires: DateTime.UtcNow.AddMinutes(expiryMinutes),
				signingCredentials: credentials
			);

			return new JwtSecurityTokenHandler().WriteToken(token);
		}
	}
}