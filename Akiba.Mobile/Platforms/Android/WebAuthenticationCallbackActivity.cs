using Android.App;
using Android.Content;
using Android.Content.PM;

namespace Akiba.Mobile;

// Catches the akiba://auth link the sign-in page opens at the end, and hands
// it back to WebAuthenticator (see Config.AuthCallback).
[Activity(NoHistory = true, LaunchMode = LaunchMode.SingleTop, Exported = true)]
[IntentFilter([Intent.ActionView],
    Categories = [Intent.CategoryDefault, Intent.CategoryBrowsable],
    DataScheme = "akiba", DataHost = "auth")]
public class WebAuthenticationCallbackActivity : WebAuthenticatorCallbackActivity
{
}
