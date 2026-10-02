using Akiba.Mobile.ViewModels;
using Microsoft.Extensions.DependencyInjection;

namespace Akiba.Mobile.Pages;

public partial class EditTransactionPage : ContentPage
{
    private readonly EditTransactionViewModel _vm;

    public EditTransactionPage(EditTransactionViewModel vm)
    {
        InitializeComponent();
        BindingContext = _vm = vm;
    }

    // Opens the editor from any page: id = null to add a new transaction.
    public static async Task OpenAsync(INavigation navigation, IServiceProvider services, Guid? id, bool isExpense = true)
    {
        var page = services.GetRequiredService<EditTransactionPage>();
        await page._vm.InitAsync(id, isExpense);
        await navigation.PushAsync(page);
    }

    private void OnExpense(object? sender, EventArgs e) => _vm.IsExpense = true;
    private void OnIncome(object? sender, EventArgs e) => _vm.IsExpense = false;

    private async void OnSave(object? sender, EventArgs e)
    {
        SaveButton.IsEnabled = false;
        try
        {
            if (await _vm.SaveAsync()) await Navigation.PopAsync();
        }
        finally
        {
            SaveButton.IsEnabled = true;
        }
    }

    private async void OnDelete(object? sender, EventArgs e)
    {
        if (!await DisplayAlertAsync("Delete transaction?", "It's removed from your balance and spending.", "Delete", "Cancel"))
            return;
        await _vm.DeleteAsync();
        await Navigation.PopAsync();
    }
}
