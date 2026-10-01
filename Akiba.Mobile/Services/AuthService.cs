namespace Akiba.Mobile.Services;

public class SignInException(string message) : Exception(message);

// Sign-in runs in a browser tab: /mobile-login.html shows Google's button,
// Google posts the result to the server, and the server sends our own JWT
// back to the app via akiba://auth (see akiba-web/server/routes/auth.js).
public class AuthService(LocalDb db)
{
    private const string TokenKey = "akiba_token";
    private const string UserIdKey = "akiba_user_id";
    private const string NameKey = "akiba_display_name";
    // Whose data is in the local database. Outlives an expired session, so a
    // different account signing in afterwards still triggers a wipe.
    private const string DataOwnerKey = "akiba_data_owner";

    // The token lives in SecureStorage (Android Keystore). The user id is a
    // plain preference so app start can check "signed in?" synchronously.
    public bool IsSignedIn => Preferences.Default.ContainsKey(UserIdKey);
    public string DisplayName => Preferences.Default.Get(NameKey, "");

    public Task<string?> GetTokenAsync() => SecureStorage.Default.GetAsync(TokenKey);

    public async Task SignInAsync()
    {
        WebAuthenticatorResult result;
        try
        {
            result = await WebAuthenticator.Default.AuthenticateAsync(new WebAuthenticatorOptions
            {
                Url = new Uri($"{Config.ApiBase}/mobile-login.html"),
                CallbackUrl = new Uri(Config.AuthCallback),
            });
        }
        catch (TaskCanceledException)
        {
            throw new SignInException("Sign-in was cancelled.");
        }

        if (result.Properties.TryGetValue("error", out var error))
            throw new SignInException($"Sign-in failed ({error}). Please try again.");
        if (!result.Properties.TryGetValue("token", out var token) ||
            !result.Properties.TryGetValue("userId", out var userId))
            throw new SignInException("Sign-in didn't return a session. Please try again.");

        // A different account than whoever's data is stored: drop it.
        var owner = Preferences.Default.Get(DataOwnerKey, "");
        if (owner != "" && owner != userId)
            await db.ClearAsync();
        Preferences.Default.Set(DataOwnerKey, userId);

        await SecureStorage.Default.SetAsync(TokenKey, token);
        Preferences.Default.Set(UserIdKey, userId);
        Preferences.Default.Set(NameKey, result.Properties.GetValueOrDefault("displayName", ""));
    }

    // Token expired or rejected: forget it but keep this user's local data,
    // since signing back in is almost always the same person.
    public void ForgetSession()
    {
        SecureStorage.Default.Remove(TokenKey);
        Preferences.Default.Remove(UserIdKey);
    }

    public async Task SignOutAsync()
    {
        SecureStorage.Default.Remove(TokenKey);
        Preferences.Default.Remove(UserIdKey);
        Preferences.Default.Remove(NameKey);
        Preferences.Default.Remove(DataOwnerKey);
        await db.ClearAsync();
    }
}
