using System.Security.Claims;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using TaskFlow.Api.Auth;
using TaskFlow.Api.Data;
using TaskFlow.Api.Models;
using TaskFlow.Api.Services;

namespace TaskFlow.Api.Controllers;

public record RegisterInput(string Email, string Password);
public record LoginInput(string Email, string Password);
public record ChangePasswordInput(string CurrentPassword, string NewPassword);
public record DeleteAccountInput(string Password);
public record UserDto(int Id, string Email);

[ApiController]
[Route("api/auth")]
[EnableRateLimiting("auth")]
public partial class AuthController(
    TaskFlowDbContext db, PasswordHasher hasher, IConfiguration config, TimeProvider time,
    AttachmentService attachments, BackupService backups) : ControllerBase
{
    public const int MinPasswordLength = 10, MaxPasswordLength = 128;
    public const string StampClaim = "pwd-stamp";
    private const int MaxFailures = 5;
    private static readonly TimeSpan LockFor = TimeSpan.FromMinutes(15);

    [GeneratedRegex(@"^[^@\s]+@[^@\s]+\.[^@\s]+$")]
    private static partial Regex EmailPattern();

    [AllowAnonymous]
    [HttpPost("register")]
    public async Task<ActionResult<UserDto>> Register(RegisterInput input)
    {
        if (!config.GetValue("Auth:AllowRegistration", true))
            return StatusCode(403, new ProblemDetails { Title = "Registration is closed." });

        var email = NormalizeEmail(input.Email);
        if (email is null) return Invalid("Email", "Enter a valid email address.");
        if (PasswordProblem(input.Password, email) is { } problem) return Invalid("Password", problem);

        var maxUsers = config.GetValue("Auth:MaxUsers", 500);
        if (await db.Users.CountAsync() >= maxUsers)
            return StatusCode(403, new ProblemDetails { Title = "This Lifegrid instance is full and is not accepting new accounts." });

        var user = new User { Email = email, PasswordHash = hasher.Hash(input.Password), CreatedAt = time.GetUtcNow().UtcDateTime };
        db.Users.Add(user);
        try { await db.SaveChangesAsync(); }
        catch (DbUpdateException) { return Conflict(new ProblemDetails { Title = "An account with that email already exists." }); }

        if (config.GetValue("Auth:AdoptLegacyData", false)) await AdoptLegacyDataAsync(user);
        await SignIn(user);
        return Created("/api/auth/me", new UserDto(user.Id, user.Email));
    }

    /// <summary>
    /// Databases created before accounts existed keep their rows under a placeholder owner (id 0). When
    /// <c>Auth:AdoptLegacyData</c> is on, the FIRST account registered on such a database takes that data over
    /// (rows and attachment files). Off by default: a public deployment starts empty and must never enable it.
    /// </summary>
    private async Task AdoptLegacyDataAsync(User user)
    {
        if (await db.Users.CountAsync(u => u.Id != 0) != 1 || !await db.Users.AnyAsync(u => u.Id == 0)) return;
        var uid = user.Id;
        await using var tx = await db.Database.BeginTransactionAsync();
        await db.Categories.IgnoreQueryFilters().Where(x => x.UserId == 0).ExecuteUpdateAsync(s => s.SetProperty(x => x.UserId, uid));
        await db.Tags.IgnoreQueryFilters().Where(x => x.UserId == 0).ExecuteUpdateAsync(s => s.SetProperty(x => x.UserId, uid));
        await db.RecurrenceRules.IgnoreQueryFilters().Where(x => x.UserId == 0).ExecuteUpdateAsync(s => s.SetProperty(x => x.UserId, uid));
        await db.Tasks.IgnoreQueryFilters().Where(x => x.UserId == 0).ExecuteUpdateAsync(s => s.SetProperty(x => x.UserId, uid));
        await db.TaskTags.IgnoreQueryFilters().Where(x => x.UserId == 0).ExecuteUpdateAsync(s => s.SetProperty(x => x.UserId, uid));
        await db.Subtasks.IgnoreQueryFilters().Where(x => x.UserId == 0).ExecuteUpdateAsync(s => s.SetProperty(x => x.UserId, uid));
        await db.Reminders.IgnoreQueryFilters().Where(x => x.UserId == 0).ExecuteUpdateAsync(s => s.SetProperty(x => x.UserId, uid));
        await db.Notifications.IgnoreQueryFilters().Where(x => x.UserId == 0).ExecuteUpdateAsync(s => s.SetProperty(x => x.UserId, uid));
        await db.FocusSessions.IgnoreQueryFilters().Where(x => x.UserId == 0).ExecuteUpdateAsync(s => s.SetProperty(x => x.UserId, uid));
        await db.Activity.IgnoreQueryFilters().Where(x => x.UserId == 0).ExecuteUpdateAsync(s => s.SetProperty(x => x.UserId, uid));
        await db.Attachments.IgnoreQueryFilters().Where(x => x.UserId == 0).ExecuteUpdateAsync(s => s.SetProperty(x => x.UserId, uid));
        await db.Users.Where(u => u.Id == 0).ExecuteDeleteAsync();
        await tx.CommitAsync();

        // Legacy attachment files lived directly in the attachments folder; each user now has a private sub-folder.
        var root = Path.GetFullPath(config["Attachments:Directory"] ?? "");
        foreach (var stored in await db.Attachments.IgnoreQueryFilters().Where(x => x.UserId == uid).Select(x => x.StoredName).ToListAsync())
        {
            var from = Path.Combine(root, Path.GetFileName(stored));
            if (!System.IO.File.Exists(from)) continue;
            Directory.CreateDirectory(attachments.Directory);
            System.IO.File.Move(from, Path.Combine(attachments.Directory, Path.GetFileName(stored)), overwrite: false);
        }
    }

    [AllowAnonymous]
    [HttpPost("login")]
    public async Task<ActionResult<UserDto>> Login(LoginInput input)
    {
        var email = NormalizeEmail(input.Email) ?? "";
        var password = input.Password ?? "";
        var user = await db.Users.FirstOrDefaultAsync(u => u.Email == email);
        var now = time.GetUtcNow().UtcDateTime;

        if (user is { LockedUntil: { } until } && until > now)
        {
            hasher.Verify(password, hasher.DummyHash); // keep timing uniform
            return StatusCode(429, new ProblemDetails { Title = "Too many failed attempts. Try again in a few minutes." });
        }

        var ok = hasher.Verify(password, user?.PasswordHash ?? hasher.DummyHash) && user is not null;
        if (!ok)
        {
            if (user is not null)
            {
                user.FailedLogins++;
                if (user.FailedLogins >= MaxFailures) { user.LockedUntil = now + LockFor; user.FailedLogins = 0; }
                await db.SaveChangesAsync();
            }
            return Unauthorized(new ProblemDetails { Title = "Invalid email or password." });
        }

        user!.FailedLogins = 0;
        user.LockedUntil = null;
        user.LastLoginAt = now;
        await db.SaveChangesAsync();
        await SignIn(user);
        return new UserDto(user.Id, user.Email);
    }

    [AllowAnonymous]
    [HttpPost("logout")]
    public async Task<IActionResult> Logout()
    {
        await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        return NoContent();
    }

    /// <summary>401 when nobody is signed in; the web app uses this to decide between the login page and the app.</summary>
    [Authorize]
    [HttpGet("me")]
    public async Task<ActionResult<UserDto>> Me()
    {
        var user = await CurrentAsync();
        return user is null ? Unauthorized() : new UserDto(user.Id, user.Email);
    }

    [Authorize]
    [HttpPost("change-password")]
    public async Task<IActionResult> ChangePassword(ChangePasswordInput input)
    {
        var user = await CurrentAsync();
        if (user is null) return Unauthorized();
        if (!hasher.Verify(input.CurrentPassword ?? "", user.PasswordHash))
            return Invalid("CurrentPassword", "The current password is incorrect.");
        if (PasswordProblem(input.NewPassword, user.Email) is { } problem) return Invalid("NewPassword", problem);
        user.PasswordHash = hasher.Hash(input.NewPassword);
        await db.SaveChangesAsync();
        await SignIn(user); // other sessions carry the old stamp and stop working
        return NoContent();
    }

    /// <summary>Permanently deletes the account and everything it owns (rows cascade; files are removed).</summary>
    [Authorize]
    [HttpPost("delete-account")]
    public async Task<IActionResult> DeleteAccount(DeleteAccountInput input)
    {
        var user = await CurrentAsync();
        if (user is null) return Unauthorized();
        if (!hasher.Verify(input.Password ?? "", user.PasswordHash))
            return Invalid("Password", "The password is incorrect.");
        var folders = new[] { attachments.Directory, backups.Directory };
        db.Users.Remove(user);
        await db.SaveChangesAsync();
        foreach (var dir in folders)
            try { if (Directory.Exists(dir)) Directory.Delete(dir, true); } catch { /* best effort */ }
        await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        return NoContent();
    }

    private async Task<User?> CurrentAsync()
    {
        var id = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        return await db.Users.FirstOrDefaultAsync(u => u.Id == id);
    }

    private Task SignIn(User user)
    {
        var identity = new ClaimsIdentity(
            [new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()), new Claim(ClaimTypes.Email, user.Email),
             new Claim(StampClaim, PasswordHasher.Stamp(user.PasswordHash))],
            CookieAuthenticationDefaults.AuthenticationScheme);
        return HttpContext.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, new ClaimsPrincipal(identity),
            new AuthenticationProperties { IsPersistent = true });
    }

    public static string? NormalizeEmail(string? raw)
    {
        var e = (raw ?? "").Trim().ToLowerInvariant();
        return e.Length is > 0 and <= 254 && EmailPattern().IsMatch(e) ? e : null;
    }

    private static string? PasswordProblem(string? password, string email)
    {
        if (string.IsNullOrEmpty(password) || password.Length < MinPasswordLength)
            return $"Use at least {MinPasswordLength} characters.";
        if (password.Length > MaxPasswordLength) return $"Use at most {MaxPasswordLength} characters.";
        if (password.Equals(email, StringComparison.OrdinalIgnoreCase)) return "The password cannot be your email address.";
        if (password.Trim().Length == 0) return "The password cannot be only spaces.";
        return null;
    }

    private ActionResult Invalid(string field, string message)
    {
        ModelState.AddModelError(field, message);
        return ValidationProblem(ModelState);
    }
}
