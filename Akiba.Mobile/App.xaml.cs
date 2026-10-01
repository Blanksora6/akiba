using Akiba.Mobile.Pages;
using Akiba.Mobile.Services;
using Microsoft.Extensions.DependencyInjection;

namespace Akiba.Mobile;

public partial class App : Application
{
    private readonly IServiceProvider _services;
    private readonly AuthService _auth;
    private readonly SyncService _sync;

    public App(IServiceProvider services, AuthService auth, SyncService sync)
    {
        InitializeComponent();
        UserAppTheme = AppTheme.Dark;
        _services = services;
        _auth = auth;
        _sync = sync;

        // Server rejected our token (e.g. 30-day expiry) — back to sign-in.
        _sync.SessionExpired += ShowLogin;
    }

    protected override Window CreateWindow(IActivationState? activationState)
    {
        var window = new Window(_auth.IsSignedIn ? BuildShell() : _services.GetRequiredService<LoginPage>());
        if (_auth.IsSignedIn) StartSyncing();
        return window;
    }

    public void ShowMain()
    {
        Windows[0].Page = BuildShell();
        StartSyncing();
    }

    public void ShowLogin() => Windows[0].Page = _services.GetRequiredService<LoginPage>();

    private Page BuildShell() => _services.GetRequiredService<AppShell>();

    // Saved data shows immediately; a background pull brings it up to date,
    // and another runs whenever the phone comes back online.
    private void StartSyncing()
    {
        _sync.StartWatchingConnectivity();
        _ = _sync.SyncAsync();
    }
}
