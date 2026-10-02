using Akiba.Mobile.ViewModels;

namespace Akiba.Mobile.Pages;

public partial class TransactionsPage : ContentPage
{
    private readonly TransactionsViewModel _vm;
    private readonly IServiceProvider _services;

    public TransactionsPage(TransactionsViewModel vm, IServiceProvider services)
    {
        InitializeComponent();
        BindingContext = _vm = vm;
        _services = services;
    }

    private async void OnAdd(object? sender, EventArgs e) =>
        await EditTransactionPage.OpenAsync(Navigation, _services, null);

    // Tap a row to edit it.
    private async void OnSelected(object? sender, SelectionChangedEventArgs e)
    {
        if (e.CurrentSelection.FirstOrDefault() is not TransactionRowView row) return;
        ((CollectionView)sender!).SelectedItem = null;
        await EditTransactionPage.OpenAsync(Navigation, _services, row.Id);
    }

    protected override async void OnAppearing()
    {
        base.OnAppearing();
        await _vm.LoadAsync();
    }
}
