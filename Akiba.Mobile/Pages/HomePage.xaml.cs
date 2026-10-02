using Akiba.Mobile.Services;
using Akiba.Mobile.ViewModels;

namespace Akiba.Mobile.Pages;

public partial class HomePage : ContentPage
{
    private readonly HomeViewModel _vm;
    private readonly AuthService _auth;
    private readonly IServiceProvider _services;

    public HomePage(HomeViewModel vm, AuthService auth, IServiceProvider services)
    {
        InitializeComponent();
        BindingContext = _vm = vm;
        _auth = auth;
        _services = services;
    }

    private async void OnAddExpense(object? sender, EventArgs e) =>
        await EditTransactionPage.OpenAsync(Navigation, _services, null, isExpense: true);

    private async void OnAddIncome(object? sender, EventArgs e) =>
        await EditTransactionPage.OpenAsync(Navigation, _services, null, isExpense: false);

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
