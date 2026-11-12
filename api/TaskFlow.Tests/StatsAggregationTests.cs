using System.Net;
using System.Net.Http.Json;
using TaskFlow.Api.Dtos;

namespace TaskFlow.Tests;

/// <summary>
/// Volume-scale comparisons for the gamification and focus statistics endpoints. Aggregation moved from
/// loading whole tables into memory to database-side queries; these tests seed sizeable history through the
/// real API and assert every returned figure against independently computed expected values, so any
/// change in results (not just in execution plan) fails loudly.
/// </summary>
public class GamificationAggregationTests : TestBase
{
    private static readonly DateTimeOffset Now = new(2026, 11, 12, 12, 0, 0, TimeSpan.Zero); // local day 2026-11-12
    private FixedTimeProvider _clock = null!;

    /// <summary>Points per completion, cycling one priority per task (Medium, High, Urgent, Low, Urgent).</summary>
    private static int Points(int i) => (i % 5) switch { 0 => 10, 1 or 2 or 4 => 15, _ => 5 };
    private static string Priority(int i) => new[] { "Medium", "High", "Urgent", "Low", "Urgent" }[i % 5];

    public GamificationAggregationTests() : this(new FixedTimeProvider(Now)) { }
    private GamificationAggregationTests(FixedTimeProvider clock) : base(new ApiFactory(clock: clock)) => _clock = clock;

    [Fact]
    public async Task Aggregates_over_fifty_five_reward_rows_match_hand_computed_figures()
    {
        const int count = 55;
        var tasks = new List<TaskDto>();
        for (var i = 0; i < count; i++)
        {
            // No due date: every completion is plain task XP, so the history ordering stays strict.
            var task = await CreateTask(new { title = $"Volume task {i}", priority = Priority(i) });
            _clock.Set(Now.AddSeconds(i)); // a distinct AwardedAt per completion makes history order deterministic
            await Http.PatchAsync($"/api/tasks/{task.Id}/toggle", null);
            tasks.Add(task);
        }

        var expectedTotal = Enumerable.Range(0, count).Sum(Points);
        var s = (await Http.GetFromJsonAsync<GamificationDto>("/api/gamification", Json))!;

        Assert.Equal(660, expectedTotal);
        Assert.Equal(expectedTotal, s.TotalXp);
        Assert.Equal(expectedTotal / 100 + 1, s.Level);     // 7
        Assert.Equal(expectedTotal % 100, s.LevelProgress); // 60
        Assert.Equal(expectedTotal, s.XpThisWeek);          // all earned on 2026-11-12, inside the week
        Assert.Equal(count, s.CompletedThisWeek);
        Assert.Equal(1, s.CurrentStreak);
        Assert.Equal(1, s.LongestStreak);
        Assert.Equal(100, s.XpPerLevel);
        Assert.All(s.RewardHistory, x => Assert.Equal(new DateOnly(2026, 11, 12), x.Date));

        // Achievements see 55 distinct completed tasks even though they come from a SQL union of
        // ledger rows, completion activity rows and completed tasks.
        Assert.All(new[] { "first-task", "ten-tasks", "fifty-tasks" },
            key => Assert.True(s.Achievements.Single(a => a.Key == key).Unlocked));
        Assert.Equal(1, s.Achievements.Single(a => a.Key == "first-task").Progress);
        Assert.Equal(10, s.Achievements.Single(a => a.Key == "ten-tasks").Progress);
        Assert.Equal(50, s.Achievements.Single(a => a.Key == "fifty-tasks").Progress);

        // 55 ledger rows exist; only the newest 50 are returned, strictly newest first — the five
        // oldest completions are exactly the dropped ones.
        Assert.Equal(50, s.RewardHistory.Count);
        for (var i = 0; i < 50; i++)
        {
            Assert.Equal(Points(count - 1 - i), s.RewardHistory[i].Points); // completion 54 first, 5 last
            Assert.Equal(Now.AddSeconds(count - 1 - i).DateTime, s.RewardHistory[i].AwardedAt);
        }

        // Reopening one task must not change any figure: the ledger entry and the completion
        // activity row both survive, and the SQL union still counts the task once.
        await Http.PatchAsync($"/api/tasks/{tasks[0].Id}/toggle", null);
        var reopened = (await Http.GetFromJsonAsync<GamificationDto>("/api/gamification", Json))!;
        Assert.Equal(expectedTotal, reopened.TotalXp);
        Assert.Equal(count, reopened.CompletedThisWeek);
        Assert.True(reopened.Achievements.Single(a => a.Key == "fifty-tasks").Unlocked);
        Assert.Equal(50, reopened.Achievements.Single(a => a.Key == "fifty-tasks").Progress);
    }
}

public class FocusAggregationTests : TestBase
{
    private static readonly DateTimeOffset Now = new(2026, 11, 12, 12, 0, 0, TimeSpan.Zero);

    public FocusAggregationTests() : base(new ApiFactory(clock: new FixedTimeProvider(Now))) { }

    private object Session(int daysAgo, int minutes, bool completed, int? taskId = null, string kind = "Focus")
    {
        // An hour before the anchor keeps same-day sessions fully in the past.
        var start = (Now - TimeSpan.FromDays(daysAgo) - TimeSpan.FromHours(1)).UtcDateTime; // DateTime Kind=Utc, round-trips as 'Z'
        return new
        {
            kind, plannedSeconds = minutes * 60, actualSeconds = minutes * 60, completed,
            startedAt = start, endedAt = start.AddMinutes(minutes), taskId,
        };
    }

    /// <summary>Records a session and fails the test if the API rejects it.</summary>
    private Task<HttpResponseMessage> Record(object body) => Http.PostAsJsonAsync("/api/focus/sessions", body, Json);

    private async Task<FocusStatsDto> Stats(string query = "") =>
        (await Http.GetFromJsonAsync<FocusStatsDto>("/api/focus/stats" + query, Json))!;

    [Fact]
    public async Task Stats_mix_window_and_all_time_figures_across_many_sessions()
    {
        var t1 = await CreateTask(new { title = "Task one" });
        var t2 = await CreateTask(new { title = "Task two" });
        var t3 = await CreateTask(new { title = "Task three" });
        var t4 = await CreateTask(new { title = "Task four" });
        var t5 = await CreateTask(new { title = "Task five" });
        var t6 = await CreateTask(new { title = "Breaks only" });

        Task<HttpResponseMessage>[] posts =
        [
            Record(Session(0, 25, true, t1.Id)),
            Record(Session(0, 25, true, t1.Id)),
            Record(Session(0, 5, false, t6.Id, kind: "ShortBreak")), // never in stats
            Record(Session(1, 35, true, t2.Id)),
            Record(Session(2, 15, true, t3.Id)),
            Record(Session(3, 15, true, t3.Id)),
            Record(Session(4, 15, true, t3.Id)),
            Record(Session(9, 25, false)),                      // not counted as a streak day
        ];
        var streakPosts = Enumerable.Range(10, 8)                         // an 8-day streak 1.5 weeks ago
            .Select(d => Record(Session(d, 10, true, t4.Id)));
        var oldPosts = new[] { 80, 75, 70, 65, 60 }                       // weeks outside the 31-day window
            .Select(d => Record(Session(d, 12, true, t5.Id)));
        var all = posts.Select(p => (p, "main"))
            .Concat(streakPosts.Select(p => (p, "streak")))
            .Concat(oldPosts.Select(p => (p, "old"))).ToList();
        for (var i = 0; i < all.Count; i++)
        {
            var res = await all[i].p;
            Assert.True(res.IsSuccessStatusCode, $"post {i} ({all[i].Item2}): {(int)res.StatusCode} {await res.Content.ReadAsStringAsync()}");
        }

        var today = new DateOnly(2026, 11, 12);
        var s = await Stats("?days=31");

        Assert.Equal(today, s.Today);
        Assert.Equal(3000, s.TodaySeconds);   // two 25-minute focus runs; the Break is not focus time
        Assert.Equal(2, s.TodaySessions);
        Assert.Equal(6900, s.WeekSeconds);    // 900 + 900 + 2100 + 3000 within Mon 2026-11-09..today
        Assert.Equal(17700, s.TotalSeconds);  // everything above plus the 900s day-4 run and the 1500s aborted run
        Assert.Equal(19, s.TotalSessions);    // completed sessions only, all time (the day-4 run is pre-week)
        Assert.Equal(5, s.CurrentStreak);     // completed runs on days 0..4
        Assert.Equal(8, s.BestStreak);        // days 10..17
        Assert.Equal(14.2, s.AverageSessionMinutes); // 16200s / 19 / 60 rounded to one decimal

        // The daily series spans exactly 31 days and reads the per-day window sums.
        Assert.Equal(31, s.Daily.Count);
        var byDate = s.Daily.ToDictionary(d => d.Date);
        Assert.Equal(new DateOnly(2026, 10, 13), s.Daily[0].Date); // today minus 30
        Assert.Equal(today, s.Daily[^1].Date);
        Assert.Equal(3000, byDate[today].Seconds);
        Assert.Equal(2, byDate[today].Sessions);
        Assert.Equal(2100, byDate[today.AddDays(-1)].Seconds);
        Assert.Equal(600, byDate[today.AddDays(-13)].Seconds);      // inside the 8-day streak
        Assert.Equal(1500, byDate[today.AddDays(-9)].Seconds);      // aborted run: seconds but no session
        Assert.Equal(0, byDate[today.AddDays(-9)].Sessions);
        Assert.Equal(0, byDate[today.AddDays(-25)].Seconds);        // window day without sessions

        // Top five aggregates from SQL: all-time per-task totals, strongest first, no ties.
        Assert.Equal(5, s.TopTasks.Count);
        Assert.Equal([(t4.Id, 4800), (t5.Id, 3600), (t1.Id, 3000), (t3.Id, 2700), (t2.Id, 2100)],
            s.TopTasks.Select(t => (t.TaskId, t.Seconds)).ToArray());
        Assert.Equal(8, s.TopTasks[0].Sessions);
        Assert.Equal("Task four", s.TopTasks[0].Title);

        // A narrow 3-day window still reports the all-time figures and the Monday-anchored week,
        // even though the week starts a day before the window.
        var narrow = await Stats("?days=3");
        Assert.Equal(3, narrow.Daily.Count);
        Assert.Equal(new DateOnly(2026, 11, 10), narrow.Daily[0].Date);
        Assert.Equal(6900, narrow.WeekSeconds);
        Assert.Equal(17700, narrow.TotalSeconds);
        Assert.Equal(19, narrow.TotalSessions);
        Assert.Equal(8, narrow.BestStreak);
        Assert.Equal([(t4.Id, 4800), (t5.Id, 3600), (t1.Id, 3000), (t3.Id, 2700), (t2.Id, 2100)],
            narrow.TopTasks.Select(t => (t.TaskId, t.Seconds)).ToArray());
    }
}
