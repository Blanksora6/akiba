using Akiba.Data;
using Akiba.Endpoints;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.Text;

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

// JWT bearer auth. Every data endpoint calls .RequireAuthorization() and reads the
// user from the token's claims — /api/auth/google is the only open endpoint, since
// it's the one that issues tokens in the first place.
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidateAudience = true,
            ValidAudience = builder.Configuration["Jwt:Audience"],
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(builder.Configuration["Jwt:SigningKey"]!))
        };
    });
builder.Services.AddAuthorization();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();
app.UseCors("AllowWebClient");
app.UseAuthentication();
app.UseAuthorization();

app.MapAuthEndpoints();
app.MapProfileEndpoints();
app.MapClassEndpoints();
app.MapTransactionEndpoints();
app.MapGoalEndpoints();
app.MapSyncEndpoints();

app.Run();