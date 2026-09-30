using System.Security.Claims;

namespace Akiba.Endpoints
{
    public static class AuthExtensions
    {
        // Every endpoint below used to take `Guid userId` as a query param —
        // that was always a placeholder for "read this from the signed-in
        // user's token," never a real design. This is that real thing.
        public static Guid GetUserId(this ClaimsPrincipal user)
        {
            var idClaim = user.FindFirstValue(ClaimTypes.NameIdentifier);
            if (idClaim is null || !Guid.TryParse(idClaim, out var id))
                throw new UnauthorizedAccessException("No valid user id in token.");
            return id;
        }
    }
}