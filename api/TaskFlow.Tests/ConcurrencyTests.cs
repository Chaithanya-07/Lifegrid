using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using TaskFlow.Api.Auth;
using TaskFlow.Api.Data;
using TaskFlow.Api.Services;

namespace TaskFlow.Tests;

/// <summary>
/// Concurrency regressions: two writers (two open tabs each polling the notification-sync timer, or two
/// weekly-goal updates) both pass an existence check and both insert; the second must lose gracefully
/// against the unique index instead of 500ing, without duplicating rows, without losing the reminder
/// "notified" stamps, and without swallowing unrelated database errors. The deterministic cases interleave
/// the real stage/commit halves of the services around an actually committed "winner"; the storm drives
/// the same code paths with genuinely concurrent HTTP requests on a shared throwaway SQLite file.
/// </summary>
public sealed class ConcurrentWriteTests : TestBase
{
    private static readonly DateTimeOffset Now = new(2026, 11, 12, 9, 0, 0, TimeSpan.Zero);

    public ConcurrentWriteTests() : base(new ApiFactory(clock: new FixedTimeProvider(Now))) { }

    private int _userId;

    [Fact]
    public async Task a_notification_sync_losing_the_dedupe_race_does_not_500_or_duplicate()
    {
        await EnsureUserAsync();

        // A reminder that is due right now (due 10:00, reminder at 09:00, clock 09:00).
        await CreateTask(new
        {
            title = "Race target",
            dueDate = "2026-11-12",
            dueTime = "10:00",
            reminders = new[] { new { minutesBefore = 60 } },
        });

        // Writer A stages its notification (its existence checks passed, nothing saved).
        var svcA = new NotificationService(Ctx(), Factory.Clock!);
        var staged = await svcA.StageAsync(includeOverdue: false);
        Assert.Single(staged);
        Assert.StartsWith("reminder:", staged[0].DedupeKey);

        // Writer B commits the same dedupe key between A's checks and A's save — exactly what a second
        // open tab polling the same timer produces.
        var winner = await new NotificationService(Ctx(), Factory.Clock!).SyncAsync(includeOverdue: false);
        Assert.Equal(1, winner);
        var winnerCreatedAt = (await Ctx().Notifications.IgnoreQueryFilters().SingleAsync()).CreatedAt;

        // A saves second: it loses the unique (UserId, DedupeKey) race and must drop the duplicate
        // instead of failing — while still persisting its NotifiedAt stamp.
        var created = await svcA.SaveStagedAsync(staged);
        Assert.Equal(0, created);

        using (var ctx = Ctx())
        {
            var row = Assert.Single(await ctx.Notifications.IgnoreQueryFilters().ToListAsync());
            Assert.Equal(staged[0].DedupeKey, row.DedupeKey);
            Assert.Equal(winnerCreatedAt, row.CreatedAt); // winner's row untouched, not duplicated, not overwritten
            Assert.False(row.ReadAt.HasValue);
        }
        // The sync stays idempotent after the race.
        Assert.Equal(0, await new NotificationService(Ctx(), Factory.Clock!).SyncAsync(includeOverdue: false));
    }

    [Fact]
    public async Task a_sync_losing_the_race_partially_keeps_its_new_rows_and_drops_only_duplicates()
    {
        await EnsureUserAsync();

        // One due reminder and one overdue task: an overdue-sync stages a reminder notification
        // and the daily digest (two rows).
        await CreateTask(new
        {
            title = "Due today with reminder",
            dueDate = "2026-11-12",
            dueTime = "10:00",
            reminders = new[] { new { minutesBefore = 60 } },
        });
        await CreateTask(new { title = "Overdue already", dueDate = "2026-11-11", dueTime = "08:00" });

        var svcA = new NotificationService(Ctx(), Factory.Clock!);
        var staged = await svcA.StageAsync(includeOverdue: true);
        Assert.Equal(2, staged.Count);

        // The competing writer commits ONLY the digest between A's checks and A's save — a partial overlap.
        using (var winnerCtx = Ctx())
        {
            winnerCtx.Notifications.Add(new TaskFlow.Api.Models.AppNotification
            {
                DedupeKey = staged.First(n => n.Kind == TaskFlow.Api.Models.NotificationKind.Overdue).DedupeKey,
                CreatedAt = Factory.Clock!.GetUtcNow().UtcDateTime,
                Title = "1 task is overdue",
                Message = "Open Today or Upcoming to reschedule or finish them.",
            });
            await winnerCtx.SaveChangesAsync();
        }

        // A commits: its duplicate digest is dropped, its genuinely-new rows are still inserted.
        var created = await svcA.SaveStagedAsync(staged);
        Assert.Equal(1, created);
        var keys = (await Ctx().Notifications.IgnoreQueryFilters().ToListAsync()).Select(n => n.DedupeKey).ToList();
        Assert.Equal(2, keys.Count);
        Assert.All(staged.Select(n => n.DedupeKey), key => Assert.Equal(1, keys.Count(k => k == key))); // no duplicates
    }

    [Fact]
    public async Task a_weekly_goal_losing_the_create_race_updates_instead_of_failing()
    {
        await CleanSettingsAsync();
        await EnsureUserAsync();

        // Writer A sees no settings row and stages an insert of goal 7.
        var svcA = new GamificationService(Ctx(), Factory.Clock!);
        var staged = await svcA.StageWeeklyGoalAsync(7);
        Assert.NotNull(staged);

        // Writer B creates the row first with goal 9.
        await new GamificationService(Ctx(), Factory.Clock!).UpsertWeeklyGoalAsync(9);
        Assert.Equal(9, (await Ctx().GamificationSettings.IgnoreQueryFilters().SingleAsync()).WeeklyGoal);

        // A commits: its insert loses the unique (UserId) race and is converted into an update
        // (last write wins), keeping exactly one row.
        await svcA.CommitWeeklyGoalAsync(staged, 7);
        using (var ctx = Ctx())
            Assert.Equal(7, (await ctx.GamificationSettings.IgnoreQueryFilters().SingleAsync()).WeeklyGoal);
    }

    [Fact]
    public async Task concurrent_http_writes_never_500_and_stay_unique()
    {
        await CleanSettingsAsync();
        await EnsureUserAsync();

        // Two tabs hammering the weekly goal: every write must succeed and exactly one row must survive.
        using var httpB = Factory.CreateClient();
        var goals = Enumerable.Range(0, 12).Select(i => new { weeklyGoal = i + 1 });
        var goalWrites = goals.Select((g, i) => (i % 2 == 0 ? Http : httpB).PutAsJsonAsync("/api/gamification/weekly-goal", g));
        Assert.All(await Task.WhenAll(goalWrites), r => Assert.Equal(HttpStatusCode.NoContent, r.StatusCode));
        using (var ctx = Ctx())
            Assert.Single(await ctx.GamificationSettings.IgnoreQueryFilters().ToListAsync());

        // Two tabs polling the sync timer with a due reminder: the notification must exist exactly once.
        await CreateTask(new
        {
            title = "Storm reminder",
            dueDate = "2026-11-12",
            dueTime = "10:00",
            reminders = new[] { new { minutesBefore = 60 } },
        });
        var syncs = Enumerable.Range(0, 8).Select(i => (i % 2 == 0 ? Http : httpB).PostAsync("/api/notifications/sync?overdue=false", null));
        Assert.All(await Task.WhenAll(syncs), r => Assert.Equal(HttpStatusCode.OK, r.StatusCode));
        using (var ctx = Ctx())
        {
            var row = Assert.Single(await ctx.Notifications.IgnoreQueryFilters().ToListAsync());
            Assert.StartsWith("reminder:", row.DedupeKey);
        }
    }

    private async Task CleanSettingsAsync()
    {
        await EnsureUserAsync();
        using var ctx = Ctx();
        await ctx.GamificationSettings.IgnoreQueryFilters().ExecuteDeleteAsync(); // clean slate (throwaway db)
    }

    private async Task EnsureUserAsync()
    {
        if (_userId == 0)
        {
            await Http.GetAsync("/api/tasks"); // the default client registers the throwaway account on first use
            using var ctx = CtxWithNoUser();
            _userId = await ctx.Users.IgnoreQueryFilters().Where(u => u.Email == "tester@example.test")
                .Select(u => u.Id).FirstAsync();
        }
    }

    private sealed record FixedUser(int? UserId) : ICurrentUser;

    private DbContextOptions<TaskFlowDbContext> Options() =>
        new DbContextOptionsBuilder<TaskFlowDbContext>().UseSqlite($"Data Source={Factory.DbPath}").Options;

    private TaskFlowDbContext Ctx() => new(Options(), new FixedUser(_userId == 0 ? null : _userId));

    private TaskFlowDbContext CtxWithNoUser() => new(Options());
}
