using Akiba.Data;
using Akiba.Endpoints;
using Microsoft.EntityFrameworkCore;

// Must be set before CreateBuilder runs — this is the one point the framework
// reads fresh every time. Setting builder.Environment.EnvironmentName afterward
// did not take effect on this project, so don't rely on that approach.
Environment.SetEnvironmentVariable("ASPNETCORE_ENVIRONMENT", "Development");

var builder = WebApplication.CreateBuilder(args);

// Hardcoded to bypass launchSettings.json entirely — port was not being read
// correctly from the profile picker, so force it here instead.
builder.WebHost.UseUrls("http://localhost:5080", "https://localhost:7080");

builder.Services.AddDbContext<AkibaDbContext>(options =>
    options.UseSqlite(builder.Configuration.GetConnectionString("AkibaDb")));

builder.Services.AddCors(options =>
{
    // Vite's dev server runs on 5173 by default — without this, every fetch()
    // from React fails with a CORS error in the browser console, not a clear
    // "CORS" message, just a network failure that looks like the request never
    // happened at all.
    options.AddPolicy("AllowWebClient", policy =>
        policy.WithOrigins("http://localhost:5173")
              .AllowAnyHeader()
              .AllowAnyMethod());
});

// Add services to the container.
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();
app.UseCors("AllowWebClient");

app.MapClassEndpoints();
app.MapTransactionEndpoints();
app.MapGoalEndpoints();
app.MapSyncEndpoints();

var summaries = new[]
{
    "Freezing", "Bracing", "Chilly", "Cool", "Mild", "Warm", "Balmy", "Hot", "Sweltering", "Scorching"
};

app.MapGet("/weatherforecast", () =>
{
    var forecast = Enumerable.Range(1, 5).Select(index =>
        new WeatherForecast
        (
            DateOnly.FromDateTime(DateTime.Now.AddDays(index)),
            Random.Shared.Next(-20, 55),
            summaries[Random.Shared.Next(summaries.Length)]
        ))
        .ToArray();
    return forecast;
})
.WithName("GetWeatherForecast");

app.Run();

internal record WeatherForecast(DateOnly Date, int TemperatureC, string? Summary)
{
    public int TemperatureF => 32 + (int)(TemperatureC / 0.5556);
}