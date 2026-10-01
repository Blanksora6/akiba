using Akiba.Mobile.Services;

namespace Akiba.Mobile.Pages;

public partial class LoginPage : ContentPage
{
    private readonly AuthService _auth;

    public LoginPage(AuthService auth)
    {
        InitializeComponent();
        _auth = auth;
    }

    private async void OnSignIn(object? sender, EventArgs e)
    {
        SetBusy(true);
        ErrorLabel.IsVisible = false;
        try
        {
            await _auth.SignInAsync();
            ((App)Application.Current!).ShowMain();
        }
        catch (SignInException ex)
        {
            ErrorLabel.Text = ex.Message;
            ErrorLabel.IsVisible = true;
        }
        catch (Exception ex)
        {
            ErrorLabel.Text = $"Couldn't sign in: {ex.Message}";
            ErrorLabel.IsVisible = true;
        }
        finally
        {
            SetBusy(false);
        }
    }

    private void SetBusy(bool busy)
    {
        SignInButton.IsEnabled = !busy;
        Busy.IsRunning = Busy.IsVisible = busy;
    }
}
