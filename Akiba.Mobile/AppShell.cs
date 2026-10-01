using Akiba.Mobile.Pages;

namespace Akiba.Mobile;

// Bottom tabs, shown once signed in. Built in code so the pages come from DI
// with their view models already injected.
public class AppShell : Shell
{
    public AppShell(HomePage home, TransactionsPage transactions)
    {
        var ink = Color.FromArgb("#0E1512");
        SetBackgroundColor(this, ink);
        SetForegroundColor(this, Color.FromArgb("#EDE8DC"));
        SetTitleColor(this, Color.FromArgb("#EDE8DC"));
        SetTabBarBackgroundColor(this, Color.FromArgb("#17211C"));
        SetTabBarForegroundColor(this, Color.FromArgb("#C9A227"));
        SetTabBarTitleColor(this, Color.FromArgb("#C9A227"));
        SetTabBarUnselectedColor(this, Color.FromArgb("#8B958E"));

        Items.Add(new TabBar
        {
            Items =
            {
                new ShellContent { Title = "Home", Content = home, Route = "home" },
                new ShellContent { Title = "Transactions", Content = transactions, Route = "transactions" },
            },
        });
    }
}
