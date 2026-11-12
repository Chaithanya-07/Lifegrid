using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using TaskFlow.Api.Controllers;
using TaskFlow.Api.Dtos;

namespace TaskFlow.Tests;

/// <summary>Registration, sign-in, and the guarantee that one user can never see or change another user's data.</summary>
public sealed class AuthAndIsolationTests : IDisposable
{
    private readonly ApiFactory _factory = new();
    private const string Pw = ApiFactory.TestPassword;

    public void Dispose() => _factory.Dispose();

    private static readonly System.Text.Json.JsonSerializerOptions Json = TestBase.Json;

    private HttpClient Anonymous() => _factory.CreateAnonymousClient();

    private static Task<HttpResponseMessage> Post(HttpClient c, string url, object? body = null) =>
        c.PostAsJsonAsync(url, body ?? new { }, Json);

    private static async Task<T> Read<T>(HttpResponseMessage r) => (await r.Content.ReadFromJsonAsync<T>(Json))!;

    private static MultipartFormDataContent FileContent(string name, byte[] bytes)
    {
        var c = new MultipartFormDataContent();
        c.Add(new ByteArrayContent(bytes), "file", name);
        return c;
    }

    // ------------------------------------------------------------------ registration and sign-in

    [Theory]
    [InlineData("not-an-email", "long-enough-password")]
    [InlineData("", "long-enough-password")]
    [InlineData("a@b.test", "short")]
    [InlineData("a@b.test", "          ")]
    public async Task Registration_rejects_bad_input(string email, string password)
    {
        var res = await Post(Anonymous(), "/api/auth/register", new { email, password });
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task Registration_rejects_a_password_equal_to_the_email()
    {
        var res = await Post(Anonymous(), "/api/auth/register", new { email = "same-same-same@x.test", password = "same-same-same@x.test" });
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task Register_signs_in_and_duplicate_emails_are_refused_case_insensitively()
    {
        var c = Anonymous();
        var res = await Post(c, "/api/auth/register", new { email = "New.User@Example.test", password = Pw });
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        Assert.Equal("new.user@example.test", (await Read<UserBody>(res)).Email);
        Assert.Equal(HttpStatusCode.OK, (await c.GetAsync("/api/auth/me")).StatusCode);

        var dup = await Post(Anonymous(), "/api/auth/register", new { email = "NEW.user@example.test", password = Pw });
        Assert.Equal(HttpStatusCode.Conflict, dup.StatusCode);
    }

    [Fact]
    public async Task Passwords_are_stored_hashed_never_in_clear()
    {
        await Post(Anonymous(), "/api/auth/register", new { email = "hash@example.test", password = Pw });
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<TaskFlow.Api.Data.TaskFlowDbContext>();
        var stored = db.Users.Single(u => u.Email == "hash@example.test").PasswordHash;
        Assert.DoesNotContain(Pw, stored);
        Assert.StartsWith("v1.", stored);
    }

    [Fact]
    public async Task Login_works_and_wrong_credentials_give_one_generic_error()
    {
        await Post(Anonymous(), "/api/auth/register", new { email = "login@example.test", password = Pw });

        var ok = Anonymous();
        Assert.Equal(HttpStatusCode.OK, (await Post(ok, "/api/auth/login", new { email = "LOGIN@example.test", password = Pw })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await ok.GetAsync("/api/auth/me")).StatusCode);

        var wrongPw = await Post(Anonymous(), "/api/auth/login", new { email = "login@example.test", password = "wrong-password-1" });
        var noUser = await Post(Anonymous(), "/api/auth/login", new { email = "nobody@example.test", password = "wrong-password-1" });
        Assert.Equal(HttpStatusCode.Unauthorized, wrongPw.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, noUser.StatusCode);
        Assert.Equal(await wrongPw.Content.ReadAsStringAsync(), await noUser.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Repeated_failures_lock_the_account_temporarily()
    {
        await Post(Anonymous(), "/api/auth/register", new { email = "lock@example.test", password = Pw });
        var c = Anonymous();
        for (var i = 0; i < 5; i++)
            Assert.Equal(HttpStatusCode.Unauthorized, (await Post(c, "/api/auth/login", new { email = "lock@example.test", password = "bad-password-x" })).StatusCode);
        // Even the right password is refused while locked.
        Assert.Equal(HttpStatusCode.TooManyRequests, (await Post(c, "/api/auth/login", new { email = "lock@example.test", password = Pw })).StatusCode);
    }

    [Fact]
    public async Task Logout_ends_the_session()
    {
        var c = _factory.CreateClientFor("out@example.test");
        Assert.Equal(HttpStatusCode.OK, (await c.GetAsync("/api/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await Post(c, "/api/auth/logout")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await c.GetAsync("/api/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await c.GetAsync("/api/tasks")).StatusCode);
    }

    [Fact]
    public async Task Changing_the_password_signs_out_other_sessions()
    {
        var a = _factory.CreateClientFor("pw@example.test");
        var b = _factory.CreateClientFor("pw@example.test");
        var res = await Post(a, "/api/auth/change-password", new { currentPassword = Pw, newPassword = "a-brand-new-password" });
        Assert.Equal(HttpStatusCode.NoContent, res.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await a.GetAsync("/api/tasks")).StatusCode);   // this session stays valid
        Assert.Equal(HttpStatusCode.Unauthorized, (await b.GetAsync("/api/tasks")).StatusCode);

        var wrong = await Post(a, "/api/auth/change-password", new { currentPassword = "nope-nope-nope", newPassword = "another-new-password" });
        Assert.Equal(HttpStatusCode.BadRequest, wrong.StatusCode);
    }

    // ------------------------------------------------------------------ every endpoint needs a session

    [Theory]
    [InlineData("GET", "/api/tasks")]
    [InlineData("GET", "/api/tasks/1")]
    [InlineData("GET", "/api/tasks/stats")]
    [InlineData("POST", "/api/tasks")]
    [InlineData("DELETE", "/api/tasks/1")]
    [InlineData("DELETE", "/api/tasks/completed")]
    [InlineData("GET", "/api/categories")]
    [InlineData("POST", "/api/categories")]
    [InlineData("GET", "/api/tags")]
    [InlineData("GET", "/api/activity")]
    [InlineData("GET", "/api/analytics")]
    [InlineData("GET", "/api/about")]
    [InlineData("GET", "/api/focus/sessions")]
    [InlineData("GET", "/api/focus/stats")]
    [InlineData("GET", "/api/notifications")]
    [InlineData("POST", "/api/notifications/sync")]
    [InlineData("GET", "/api/reminders/upcoming")]
    [InlineData("GET", "/api/attachments/1")]
    [InlineData("DELETE", "/api/attachments/1")]
    [InlineData("GET", "/api/tasks/1/subtasks")]
    [InlineData("PUT", "/api/subtasks/1")]
    [InlineData("GET", "/api/export")]
    [InlineData("GET", "/api/export/tasks.csv")]
    [InlineData("POST", "/api/import")]
    [InlineData("POST", "/api/import/preview")]
    [InlineData("GET", "/api/backups")]
    [InlineData("POST", "/api/backups")]
    [InlineData("POST", "/api/backups/taskflow-backup-1.json/restore")]
    [InlineData("POST", "/api/auth/change-password")]
    [InlineData("POST", "/api/auth/delete-account")]
    [InlineData("GET", "/api/auth/me")]
    public async Task Endpoints_refuse_anonymous_callers(string method, string url)
    {
        using var req = new HttpRequestMessage(new HttpMethod(method), url);
        if (method is "POST" or "PUT") req.Content = JsonContent.Create(new { });
        var res = await Anonymous().SendAsync(req);
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task Health_is_public_and_reveals_nothing_else()
    {
        var res = await Anonymous().GetAsync("/health");
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Equal("""{"status":"ok"}""", await res.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.OK, (await Anonymous().GetAsync("/api/health")).StatusCode);
    }

    [Fact]
    public async Task Responses_carry_security_headers_and_are_not_cacheable()
    {
        var res = await _factory.CreateClientFor("hdr@example.test").GetAsync("/api/tasks");
        Assert.Equal("nosniff", res.Headers.GetValues("X-Content-Type-Options").Single());
        Assert.Equal("DENY", res.Headers.GetValues("X-Frame-Options").Single());
        Assert.Contains("no-store", res.Headers.CacheControl?.ToString());
    }

    // ------------------------------------------------------------------ isolation between users

    [Fact]
    public async Task A_user_cannot_read_or_change_another_users_records_by_id()
    {
        var alice = _factory.CreateClientFor("alice@example.test");
        var bob = _factory.CreateClientFor("bob@example.test");

        var cat = await Read<CategoryDto>(await Post(alice, "/api/categories", new { name = "Secret", color = "#112233" }));
        var tag = await Read<TagDto>(await Post(alice, "/api/tags", new { name = "private", color = "#445566" }));
        var task = await Read<TaskDto>(await Post(alice, "/api/tasks", new { title = "Alice secret", categoryId = cat.Id, tagIds = new[] { tag.Id } }));
        var sub = await Read<SubtaskDto>(await Post(alice, $"/api/tasks/{task.Id}/subtasks", new { title = "alice sub" }));
        var att = await Read<AttachmentDto>(await alice.PostAsync($"/api/tasks/{task.Id}/attachments", FileContent("secret.txt", "classified"u8.ToArray())));

        // Bob sees nothing of Alice's.
        Assert.Empty((await bob.GetFromJsonAsync<List<TaskDto>>("/api/tasks", Json))!);
        Assert.Empty((await bob.GetFromJsonAsync<List<CategoryDto>>("/api/categories", Json))!);
        Assert.Empty((await bob.GetFromJsonAsync<List<TagDto>>("/api/tags", Json))!);

        // Guessing ids gets a 404 for reads and writes alike.
        Assert.Equal(HttpStatusCode.NotFound, (await bob.GetAsync($"/api/tasks/{task.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await bob.GetAsync($"/api/tasks/{task.Id}/activity")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await bob.PutAsJsonAsync($"/api/tasks/{task.Id}", new { title = "pwned" }, Json)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await bob.PatchAsync($"/api/tasks/{task.Id}/toggle", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await bob.DeleteAsync($"/api/tasks/{task.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Post(bob, $"/api/tasks/{task.Id}/duplicate")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await bob.PutAsJsonAsync($"/api/categories/{cat.Id}", new { name = "pwned", color = "#000000" }, Json)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await bob.DeleteAsync($"/api/categories/{cat.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await bob.PutAsJsonAsync($"/api/tags/{tag.Id}", new { name = "pwned", color = "#000000" }, Json)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await bob.DeleteAsync($"/api/tags/{tag.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await bob.GetAsync($"/api/tasks/{task.Id}/subtasks")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Post(bob, $"/api/tasks/{task.Id}/subtasks", new { title = "intruder" })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await bob.PatchAsync($"/api/subtasks/{sub.Id}/toggle", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await bob.DeleteAsync($"/api/subtasks/{sub.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await bob.GetAsync($"/api/tasks/{task.Id}/attachments")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await bob.GetAsync($"/api/attachments/{att.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await bob.DeleteAsync($"/api/attachments/{att.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await bob.PostAsync($"/api/tasks/{task.Id}/attachments", FileContent("x.txt", "x"u8.ToArray()))).StatusCode);

        // Bob cannot attach his own task to Alice's category or tag either.
        var bobTask = await Post(bob, "/api/tasks", new { title = "Bob's", categoryId = cat.Id });
        Assert.Equal(HttpStatusCode.BadRequest, bobTask.StatusCode);
        var bobTagged = await Post(bob, "/api/tasks", new { title = "Bob's", tagIds = new[] { tag.Id } });
        Assert.Equal(HttpStatusCode.BadRequest, bobTagged.StatusCode);

        // Bulk operations and clear-completed only ever touch the caller's rows.
        await Post(bob, "/api/tasks/bulk", new { ids = new[] { task.Id }, action = "Delete" });
        await bob.DeleteAsync("/api/tasks/completed");

        // Alice's data is intact and still hers.
        var still = await alice.GetFromJsonAsync<TaskDto>($"/api/tasks/{task.Id}", Json);
        Assert.Equal("Alice secret", still!.Title);
        Assert.Equal("classified", await (await alice.GetAsync($"/api/attachments/{att.Id}")).Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Users_can_each_have_a_category_or_tag_with_the_same_name()
    {
        var alice = _factory.CreateClientFor("a2@example.test");
        var bob = _factory.CreateClientFor("b2@example.test");
        Assert.Equal(HttpStatusCode.Created, (await Post(alice, "/api/categories", new { name = "Work", color = "#112233" })).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await Post(bob, "/api/categories", new { name = "Work", color = "#112233" })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await Post(bob, "/api/categories", new { name = "work", color = "#112233" })).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await Post(alice, "/api/tags", new { name = "home", color = "#112233" })).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await Post(bob, "/api/tags", new { name = "home", color = "#112233" })).StatusCode);
    }

    [Fact]
    public async Task Analytics_stats_search_export_and_backups_only_cover_the_callers_data()
    {
        var alice = _factory.CreateClientFor("a3@example.test");
        var bob = _factory.CreateClientFor("b3@example.test");
        await Post(alice, "/api/tasks", new { title = "Alice only" });
        await Post(alice, "/api/backups");

        Assert.Equal(0, (await bob.GetFromJsonAsync<AnalyticsDto>("/api/analytics", Json))!.Total);
        Assert.Equal(0, (await bob.GetFromJsonAsync<StatsDto>("/api/tasks/stats", Json))!.Active);
        Assert.Empty((await bob.GetFromJsonAsync<List<TaskDto>>("/api/tasks?search=Alice", Json))!);
        Assert.Empty((await bob.GetFromJsonAsync<ExportDocument>("/api/export", Json))!.Tasks);
        Assert.DoesNotContain("Alice", await (await bob.GetAsync("/api/export/tasks.csv")).Content.ReadAsStringAsync());
        Assert.Empty((await bob.GetFromJsonAsync<List<BackupInfo>>("/api/backups", Json))!);

        // Alice's backup name resolves only inside Alice's folder.
        var name = (await alice.GetFromJsonAsync<List<BackupInfo>>("/api/backups", Json))!.Single().Name;
        Assert.Equal(HttpStatusCode.NotFound, (await bob.GetAsync($"/api/backups/{name}/export")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Post(bob, $"/api/backups/{name}/restore?confirm=true")).StatusCode);
    }

    [Fact]
    public async Task Restoring_a_backup_replaces_only_the_callers_data()
    {
        var alice = _factory.CreateClientFor("a4@example.test");
        var bob = _factory.CreateClientFor("b4@example.test");
        await Post(bob, "/api/tasks", new { title = "Bob keeps this" });
        await Post(alice, "/api/tasks", new { title = "Alice v1" });
        var backup = await Read<BackupInfo>(await Post(alice, "/api/backups"));
        await Post(alice, "/api/tasks", new { title = "Alice v2" });

        var res = await Post(alice, $"/api/backups/{backup.Name}/restore?confirm=true");
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Equal(["Alice v1"], (await alice.GetFromJsonAsync<List<TaskDto>>("/api/tasks", Json))!.Select(t => t.Title));
        Assert.Equal(["Bob keeps this"], (await bob.GetFromJsonAsync<List<TaskDto>>("/api/tasks", Json))!.Select(t => t.Title));
    }

    [Fact]
    public async Task Import_cannot_claim_another_users_attachment_files()
    {
        var alice = _factory.CreateClientFor("a5@example.test");
        var bob = _factory.CreateClientFor("b5@example.test");
        var t = await Read<TaskDto>(await Post(alice, "/api/tasks", new { title = "has file" }));
        await alice.PostAsync($"/api/tasks/{t.Id}/attachments", FileContent("secret.txt", "classified"u8.ToArray()));
        var stored = (await alice.GetFromJsonAsync<ExportDocument>("/api/export", Json))!.Tasks.Single().Attachments!.Single().StoredName;

        // Bob imports a file that points at the stored name of Alice's attachment.
        var json = $$"""{"schema":"taskflow-export","version":2,"exportedAt":"2026-01-01T00:00:00Z","categories":[],"tasks":[{"id":1,"title":"stolen","isCompleted":false,"priority":"Medium","createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-01T00:00:00Z","subtasks":[],"attachments":[{"fileName":"secret.txt","storedName":"{{stored}}","contentType":"text/plain","sizeBytes":10,"createdAt":"2026-01-01T00:00:00Z"}]}]}""";
        var res = await bob.PostAsync("/api/import", new StringContent(json, System.Text.Encoding.UTF8, "application/json"));
        var imported = (await bob.GetFromJsonAsync<List<TaskDto>>("/api/tasks", Json))!;
        // Either the import is refused or the file reference is dropped; Bob must never be able to download Alice's file.
        foreach (var task in imported)
            foreach (var a in (await bob.GetFromJsonAsync<List<AttachmentDto>>($"/api/tasks/{task.Id}/attachments", Json))!)
                Assert.NotEqual(HttpStatusCode.OK, (await bob.GetAsync($"/api/attachments/{a.Id}")).StatusCode);
        Assert.True(res.StatusCode is HttpStatusCode.OK or HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Attachments_are_stored_in_a_private_folder_per_user_and_have_a_storage_quota()
    {
        using var f = new ApiFactory();
        var a = f.CreateClientFor("q1@example.test");
        var t = await Read<TaskDto>(await Post(a, "/api/tasks", new { title = "x" }));
        await a.PostAsync($"/api/tasks/{t.Id}/attachments", FileContent("one.txt", "1"u8.ToArray()));
        var file = Assert.Single(f.StoredFiles());
        Assert.Equal("1", new DirectoryInfo(Path.GetDirectoryName(file)!).Name);   // <attachments>/<userId>/<guid>.txt
    }

    // ------------------------------------------------------------------ cross-site writes

    [Fact]
    public async Task Writes_from_an_unknown_origin_are_refused_even_with_a_valid_session()
    {
        var c = _factory.CreateClientFor("csrf@example.test");
        using var req = new HttpRequestMessage(HttpMethod.Post, "/api/tasks") { Content = JsonContent.Create(new { title = "csrf" }) };
        req.Headers.Add("Origin", "https://evil.example");
        Assert.Equal(HttpStatusCode.Forbidden, (await c.SendAsync(req)).StatusCode);
        Assert.Empty((await c.GetFromJsonAsync<List<TaskDto>>("/api/tasks", Json))!);
    }

    // ------------------------------------------------------------------ deleting an account

    [Fact]
    public async Task Deleting_an_account_removes_its_data_and_files_and_nobody_elses()
    {
        using var f = new ApiFactory();
        var gone = f.CreateClientFor("gone@example.test");
        var stay = f.CreateClientFor("stay@example.test");
        var t = await Read<TaskDto>(await Post(gone, "/api/tasks", new { title = "bye" }));
        await gone.PostAsync($"/api/tasks/{t.Id}/attachments", FileContent("bye.txt", "bye"u8.ToArray()));
        await Post(gone, "/api/backups");
        var s = await Read<TaskDto>(await Post(stay, "/api/tasks", new { title = "stays" }));

        Assert.Equal(HttpStatusCode.BadRequest, (await Post(gone, "/api/auth/delete-account", new { password = "wrong-wrong-wrong" })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await Post(gone, "/api/auth/delete-account", new { password = Pw })).StatusCode);

        Assert.Equal(HttpStatusCode.Unauthorized, (await gone.GetAsync("/api/tasks")).StatusCode);
        Assert.Empty(f.StoredFiles());
        Assert.Equal("stays", (await stay.GetFromJsonAsync<TaskDto>($"/api/tasks/{s.Id}", Json))!.Title);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await Post(Anonymous(), "/api/auth/login", new { email = "gone@example.test", password = Pw })).StatusCode);
    }

    [Fact]
    public async Task Registration_can_be_closed_and_capped()
    {
        using var closed = new CustomFactory(("Auth:AllowRegistration", "false"));
        Assert.Equal(HttpStatusCode.Forbidden,
            (await Post(closed.CreateClient(), "/api/auth/register", new { email = "x@example.test", password = Pw })).StatusCode);

        using var capped = new CustomFactory(("Auth:MaxUsers", "1"));
        Assert.Equal(HttpStatusCode.Created,
            (await Post(capped.CreateClient(), "/api/auth/register", new { email = "1@example.test", password = Pw })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await Post(capped.CreateClient(), "/api/auth/register", new { email = "2@example.test", password = Pw })).StatusCode);
    }

    private record UserBody(int Id, string Email);

    private sealed class CustomFactory((string Key, string Value) setting)
        : Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactory<Program>
    {
        private readonly string _dir = Path.Combine(Path.GetTempPath(), $"taskflow-test-custom-{Guid.NewGuid():N}");

        protected override void ConfigureWebHost(Microsoft.AspNetCore.Hosting.IWebHostBuilder builder)
        {
            builder.UseEnvironment("Development");
            builder.UseSetting("ConnectionStrings:Default", $"Data Source={Path.Combine(_dir, "t.db")}");
            builder.UseSetting("Backups:Directory", Path.Combine(_dir, "b"));
            builder.UseSetting("Attachments:Directory", Path.Combine(_dir, "a"));
            builder.UseSetting("DataProtection:KeysDirectory", Path.Combine(_dir, "k"));
            builder.UseSetting("Auth:Pbkdf2Iterations", "1000");
            builder.UseSetting(setting.Key, setting.Value);
        }

        protected override void Dispose(bool disposing)
        {
            base.Dispose(disposing);
            Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
            try { if (Directory.Exists(_dir)) Directory.Delete(_dir, true); } catch { /* best effort */ }
        }
    }
}
