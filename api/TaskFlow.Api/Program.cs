using System.Security.Claims;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using TaskFlow.Api.Auth;
using TaskFlow.Api.Controllers;
using TaskFlow.Api.Data;
using TaskFlow.Api.Services;

var builder = WebApplication.CreateBuilder(args);
var config = builder.Configuration;
var isDevelopment = builder.Environment.IsDevelopment();

builder.WebHost.ConfigureKestrel(o =>
{
    o.AddServerHeader = false;
    o.Limits.MaxRequestBodySize = 12 * 1024 * 1024; // attachments are capped at 10 MB; imports at ExportFormat.MaxBodyBytes
});

// Behind Railway and Vercel proxies the client address and scheme arrive in X-Forwarded-* headers.
// Enabled by ASPNETCORE_FORWARDEDHEADERS_ENABLED=true (set in the Dockerfile; for tests also by
// ForwardedHeaders:Enabled=true).
//
// Trust posture: an entry in X-Forwarded-For is honoured only if the proxy that added it (the address
// we would otherwise see) is a private or loopback network — the hosting platform's internal routing.
// The framework's ASPNETCORE_FORWARDEDHEADERS_ENABLED defaults would trust every host, letting a client
// rotate a spoofed LEFTMOST value to evade rate limiting; here public addresses in the header are
// treated as clients, never as proxies, so processing stops at the first public (i.e. real client)
// address from the right. The deployment assumption: the platform's proxies live on private networks
// and append the connecting client's address; see docs/PRODUCTION_SECURITY.md.
builder.Services.Configure<ForwardedHeadersOptions>(o =>
{
    // The platform's hosting startup would set these too; stating them here keeps the app self-sufficient.
    o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    o.ForwardLimit = null;
    o.KnownProxies.Clear();
    o.KnownNetworks.Clear();
    foreach (var (address, prefix) in new[]
    {
        // loopback (plain and IPv4-mapped)
        (System.Net.IPAddress.Parse("127.0.0.0"), 8), (System.Net.IPAddress.Parse("::ffff:127.0.0.0"), 104), (System.Net.IPAddress.Parse("::1"), 128),
        // RFC 1918 private ranges (plain and IPv4-mapped) — Railway's internal routing lives here
        (System.Net.IPAddress.Parse("10.0.0.0"), 8), (System.Net.IPAddress.Parse("::ffff:10.0.0.0"), 104),
        (System.Net.IPAddress.Parse("172.16.0.0"), 12), (System.Net.IPAddress.Parse("::ffff:172.16.0.0"), 108),
        (System.Net.IPAddress.Parse("192.168.0.0"), 16), (System.Net.IPAddress.Parse("::ffff:192.168.0.0"), 112),
        // link-local and unique-local IPv6
        (System.Net.IPAddress.Parse("169.254.0.0"), 16), (System.Net.IPAddress.Parse("fc00::"), 7), (System.Net.IPAddress.Parse("fe80::"), 10),
    })
        o.KnownNetworks.Add(new Microsoft.AspNetCore.HttpOverrides.IPNetwork(address, prefix));
});

builder.Services.AddControllers().AddJsonOptions(o =>
    o.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddOpenApi();
builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<ApiExceptionHandler>();

var connectionString = config.GetConnectionString("Default")
    ?? throw new InvalidOperationException("ConnectionStrings:Default is not configured.");
builder.Services.AddDbContext<TaskFlowDbContext>(o => o.UseSqlite(connectionString));

// ---- authentication: a signed, encrypted, HttpOnly session cookie; no token ever reaches JavaScript ----
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ICurrentUser, CurrentUser>();
builder.Services.AddSingleton<PasswordHasher>();

var keysDir = config["DataProtection:KeysDirectory"];
if (!string.IsNullOrWhiteSpace(keysDir))
    builder.Services.AddDataProtection().SetApplicationName("TaskFlow")
        .PersistKeysToFileSystem(new DirectoryInfo(Path.GetFullPath(keysDir)));
else if (!isDevelopment)
    throw new InvalidOperationException("DataProtection:KeysDirectory must be set in production so sessions survive restarts.");

builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme).AddCookie(o =>
{
    o.Cookie.Name = "taskflow.session";
    o.Cookie.HttpOnly = true;
    o.Cookie.SameSite = SameSiteMode.Lax;
    o.Cookie.SecurePolicy = isDevelopment ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
    o.ExpireTimeSpan = TimeSpan.FromDays(14);
    o.SlidingExpiration = true;
    o.Events.OnRedirectToLogin = ctx => { ctx.Response.StatusCode = StatusCodes.Status401Unauthorized; return Task.CompletedTask; };
    o.Events.OnRedirectToAccessDenied = ctx => { ctx.Response.StatusCode = StatusCodes.Status403Forbidden; return Task.CompletedTask; };
    // Every request re-checks that the account still exists and the password has not changed since sign-in.
    o.Events.OnValidatePrincipal = async ctx =>
    {
        var db = ctx.HttpContext.RequestServices.GetRequiredService<TaskFlowDbContext>();
        var ok = int.TryParse(ctx.Principal?.FindFirstValue(ClaimTypes.NameIdentifier), out var id);
        var hash = ok ? await db.Users.Where(u => u.Id == id).Select(u => u.PasswordHash).FirstOrDefaultAsync() : null;
        if (hash is null || PasswordHasher.Stamp(hash) != ctx.Principal?.FindFirstValue(AuthController.StampClaim))
        {
            ctx.RejectPrincipal();
            await ctx.HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        }
    };
});
// Deny by default: anything without [AllowAnonymous] needs a signed-in user.
builder.Services.AddAuthorizationBuilder()
    .SetFallbackPolicy(new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build());

// ---- rate limiting: a tight limit on sign-in/registration, a generous one on everything else ----
static string ClientKey(HttpContext ctx) => ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown";
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.AddPolicy("auth", ctx => RateLimitPartition.GetFixedWindowLimiter(ClientKey(ctx), _ => new FixedWindowRateLimiterOptions
    {
        PermitLimit = config.GetValue("RateLimit:AuthPerMinute", 20), Window = TimeSpan.FromMinutes(1), QueueLimit = 0,
    }));
    o.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(ctx =>
        RateLimitPartition.GetFixedWindowLimiter(
            ctx.User.FindFirstValue(ClaimTypes.NameIdentifier) is { } uid ? "u:" + uid : "ip:" + ClientKey(ctx),
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = config.GetValue("RateLimit:ApiPerMinute", 600), Window = TimeSpan.FromMinutes(1), QueueLimit = 0,
            }));
});

builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddScoped<TaskService>();
builder.Services.AddScoped<GamificationService>();
builder.Services.AddScoped<RecurrenceService>();
builder.Services.AddScoped<TagService>();
builder.Services.AddScoped<NotificationService>();
builder.Services.AddScoped<FocusService>();
builder.Services.AddScoped<AttachmentService>();
builder.Services.AddScoped<ExportService>();
builder.Services.AddScoped<ImportService>();
builder.Services.AddScoped<BackupService>();

builder.Services.AddCors(o => o.AddDefaultPolicy(p => p
    .WithOrigins(config.GetSection("Cors:Origins").Get<string[]>() ?? [])
    .AllowAnyHeader().AllowAnyMethod()));

var app = builder.Build();

// Apply pending migrations on startup; this also creates the SQLite file if it is missing.
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<TaskFlowDbContext>();
    var dir = Path.GetDirectoryName(Path.GetFullPath(new Microsoft.Data.Sqlite.SqliteConnectionStringBuilder(connectionString).DataSource));
    if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
    db.Database.Migrate();
}

// Forwarded-header processing is enabled either by the platform (Dockerfile env var) or, for tests
// and other deployments, by the ForwardedHeaders:Enabled configuration flag.
if (string.Equals(Environment.GetEnvironmentVariable("ASPNETCORE_FORWARDEDHEADERS_ENABLED"), "true", StringComparison.OrdinalIgnoreCase)
    || config.GetValue("ForwardedHeaders:Enabled", false))
    app.UseForwardedHeaders();

if (isDevelopment) app.MapOpenApi().AllowAnonymous();

app.UseExceptionHandler();

app.Use(async (ctx, next) =>
{
    ctx.Response.Headers.XContentTypeOptions = "nosniff";
    ctx.Response.Headers["Referrer-Policy"] = "no-referrer";
    ctx.Response.Headers.XFrameOptions = "DENY";
    ctx.Response.Headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'";
    if (ctx.Request.Path.StartsWithSegments("/api")) ctx.Response.Headers.CacheControl = "no-store";
    await next();
});

// Browsers attach an Origin header to cross-site writes (including "simple" POSTs that skip the CORS preflight), and the
// session cookie rides along automatically, so any write from an origin we do not serve is refused (CSRF defence).
var allowedOrigins = (config.GetSection("Cors:Origins").Get<string[]>() ?? [])
    .ToHashSet(StringComparer.OrdinalIgnoreCase);
app.Use(async (ctx, next) =>
{
    var method = ctx.Request.Method;
    var safe = HttpMethods.IsGet(method) || HttpMethods.IsHead(method) || HttpMethods.IsOptions(method);
    if (!safe && ctx.Request.Headers.TryGetValue("Origin", out var origin) && origin.Count > 0
        && !allowedOrigins.Contains(origin.ToString()))
    {
        ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
        await ctx.Response.WriteAsJsonAsync(new Microsoft.AspNetCore.Mvc.ProblemDetails
        {
            Status = 403, Title = "Cross-origin request refused.",
        });
        return;
    }
    await next();
});
app.UseCors();
app.UseAuthentication();
app.UseRateLimiter();
app.UseAuthorization();

// Liveness probe for Railway: reveals nothing but whether the database answers.
app.MapGet("/health", Health).AllowAnonymous().DisableRateLimiting();
app.MapGet("/api/health", Health).AllowAnonymous().DisableRateLimiting();

app.MapControllers();

app.Run();

static async Task<IResult> Health(TaskFlowDbContext db) =>
    await db.Database.CanConnectAsync() ? Results.Ok(new { status = "ok" }) : Results.StatusCode(503);

public partial class Program;
