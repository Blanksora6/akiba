using Akiba.Mobile.Pages;
using Akiba.Mobile.Services;
using Akiba.Mobile.ViewModels;
using Microsoft.Extensions.Logging;

namespace Akiba.Mobile;

public static class MauiProgram
{
	public static MauiApp CreateMauiApp()
	{
		var builder = MauiApp.CreateBuilder();
		builder
			.UseMauiApp<App>()
			.ConfigureFonts(fonts =>
			{
				fonts.AddFont("OpenSans-Regular.ttf", "OpenSansRegular");
				fonts.AddFont("OpenSans-Semibold.ttf", "OpenSansSemibold");
			});

		// One of each for the app's lifetime: they hold the DB connection,
		// HTTP client and sync lock.
		builder.Services.AddSingleton(_ => new LocalDb(Path.Combine(FileSystem.AppDataDirectory, "akiba.db3")));
		builder.Services.AddSingleton<AuthService>();
		builder.Services.AddSingleton(sp =>
		{
			var auth = sp.GetRequiredService<AuthService>();
			return new ApiClient(auth.GetTokenAsync, Config.ApiBase);
		});
		builder.Services.AddSingleton<SyncEngine>();
		builder.Services.AddSingleton<SyncService>();

		// Fresh pages each time the shell is rebuilt (e.g. after signing in again).
		builder.Services.AddTransient<HomeViewModel>();
		builder.Services.AddTransient<TransactionsViewModel>();
		builder.Services.AddTransient<EditTransactionViewModel>();
		builder.Services.AddTransient<EditTransactionPage>();
		builder.Services.AddTransient<LoginPage>();
		builder.Services.AddTransient<HomePage>();
		builder.Services.AddTransient<TransactionsPage>();
		builder.Services.AddTransient<AppShell>();

#if DEBUG
		builder.Logging.AddDebug();
#endif

		return builder.Build();
	}
}
