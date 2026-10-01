using Akiba.Mobile.Services;
using Akiba.Mobile.ViewModels;

namespace Akiba.Mobile.Pages;

public partial class HomePage : ContentPage
{
    private readonly HomeViewModel _vm;
    private readonly AuthService _auth;

    public HomePage(HomeViewModel vm, AuthService auth)
    {
        InitializeComponent();
        BindingContext = _vm = vm;
        _auth = auth;
    }

    protected override async void OnAppearing()
    {
        base.OnAppearing();
        await _vm.LoadAsync();
    }

    private async void OnSignOut(object? sender, EventArgs e)
    {
        var confirmed = await DisplayAlertAsync("Sign out?",
            "This removes your data from this phone. It stays safe on the server.", "Sign out", "Cancel");
        if (!confirmed) return;

        await _auth.SignOutAsync();
        ((App)Application.Current!).ShowLogin();
    }
}
