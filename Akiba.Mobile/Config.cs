namespace Akiba.Mobile;

public static class Config
{
    // Always the live API: Google sign-in is only authorized for this origin,
    // and an emulator can't reach the laptop's localhost by that name anyway.
    public const string ApiBase = "https://akiba-taupe.vercel.app";

    // Must match the scheme/host the Android callback activity listens on,
    // and MOBILE_CALLBACK in akiba-web/server/routes/auth.js.
    public const string AuthCallback = "akiba://auth";
}
