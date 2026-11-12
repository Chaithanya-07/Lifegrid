using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using TaskFlow.Api.Dtos;

namespace TaskFlow.Tests;

public class GamificationTests : TestBase
{
    private static readonly DateTimeOffset Now = new(2026, 11, 10, 12, 0, 0, TimeSpan.Zero);

    public GamificationTests() : base(new ApiFactory(clock: new FixedTimeProvider(Now))) { }

    [Fact]
    public async Task Completion_rewards_are_authoritative_once_and_daily_bonus_is_awarded_once()
    {
        var first = await CreateTask(new { title = "Low priority", priority = "Low", dueDate = "2026-11-10" });
        var second = await CreateTask(new { title = "Urgent", priority = "Urgent", dueDate = "2026-11-10" });

        var before = await Http.GetFromJsonAsync<GamificationDto>("/api/gamification", Json);
        Assert.NotNull(before);
        Assert.Equal(0, before.TotalXp);
        Assert.Equal(1, before.Level);
        Assert.Equal(10, before.WeeklyGoal);

        await Http.PatchAsync($"/api/tasks/{first.Id}/toggle", null);
        var afterFirst = await Http.GetFromJsonAsync<GamificationDto>("/api/gamification", Json);
        Assert.NotNull(afterFirst);
        Assert.Equal(5, afterFirst.TotalXp);

        await Http.PatchAsync($"/api/tasks/{second.Id}/toggle", null);
        var afterSecond = await Http.GetFromJsonAsync<GamificationDto>("/api/gamification", Json);
        Assert.NotNull(afterSecond);
        Assert.Equal(40, afterSecond.TotalXp);
        Assert.Equal(2, afterSecond.CompletedThisWeek);
        Assert.Contains(afterSecond.RewardHistory, x => x.Kind == "DailyBonus" && x.Points == 20);

        var medium = await CreateTask(new { title = "Medium priority", priority = "Medium" });
        await Http.PatchAsync($"/api/tasks/{medium.Id}/toggle", null);
        await Http.PatchAsync($"/api/tasks/{second.Id}/toggle", null);
        await Http.PatchAsync($"/api/tasks/{second.Id}/toggle", null);
        var repeated = await Http.GetFromJsonAsync<GamificationDto>("/api/gamification", Json);
        Assert.NotNull(repeated);
        Assert.Equal(50, repeated.TotalXp);
        Assert.Equal(HttpStatusCode.NoContent, (await Http.DeleteAsync($"/api/tasks/{second.Id}")).StatusCode);
        var afterDelete = await Http.GetFromJsonAsync<GamificationDto>("/api/gamification", Json);
        Assert.NotNull(afterDelete);
        Assert.Equal(50, afterDelete.TotalXp);
        Assert.Contains(afterDelete.RewardHistory, x => x.Description == "Completed: Urgent");
    }

    [Fact]
    public async Task Weekly_goal_is_validated_and_persisted()
    {
        var invalid = await Http.PutAsJsonAsync("/api/gamification/weekly-goal", new { weeklyGoal = 0 }, Json);
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);

        var updated = await Http.PutAsJsonAsync("/api/gamification/weekly-goal", new { weeklyGoal = 15 }, Json);
        Assert.Equal(HttpStatusCode.NoContent, updated.StatusCode);
        var summary = await Http.GetFromJsonAsync<GamificationDto>("/api/gamification", Json);
        Assert.NotNull(summary);
        Assert.Equal(15, summary.WeeklyGoal);
    }

    [Fact]
    public async Task Export_and_import_preserve_reward_history_and_weekly_goal()
    {
        var task = await CreateTask(new { title = "Exported task", priority = "High" });
        await Http.PatchAsync($"/api/tasks/{task.Id}/toggle", null);
        await Http.PutAsJsonAsync("/api/gamification/weekly-goal", new { weeklyGoal = 12 }, Json);

        var snapshot = await Export();
        Assert.NotNull(snapshot.Gamification);
        Assert.Single(snapshot.Gamification.Rewards);

        using var otherUser = Factory.CreateClientFor("another-user@example.test");
        var content = JsonSerializer.Serialize(snapshot, Json);
        var preview = await otherUser.PostAsync("/api/import/preview", Raw(content));
        var previewSummary = await Read<ImportSummary>(preview);
        Assert.True(previewSummary.Valid);
        Assert.Equal(2, previewSummary.Gamification!.Add);

        var imported = await otherUser.PostAsync("/api/import", Raw(content));
        Assert.Equal(HttpStatusCode.OK, imported.StatusCode);
        var summary = await otherUser.GetFromJsonAsync<GamificationDto>("/api/gamification", Json);
        Assert.NotNull(summary);
        Assert.Equal(15, summary.TotalXp);
        Assert.Equal(12, summary.WeeklyGoal);

        var repeatedPreview = await otherUser.PostAsync("/api/import/preview", Raw(content));
        var repeatedSummary = await Read<ImportSummary>(repeatedPreview);
        Assert.Equal(0, repeatedSummary.Gamification!.Add);
        Assert.Equal(2, repeatedSummary.Gamification.Skip);
    }

    [Fact]
    public async Task Bulk_completion_awards_task_xp_and_daily_bonus_once()
    {
        var low = await CreateTask(new { title = "Bulk low", priority = "Low", dueDate = "2026-11-10" });
        var high = await CreateTask(new { title = "Bulk high", priority = "High", dueDate = "2026-11-10" });
        var body = new { ids = new[] { low.Id, high.Id }, action = "complete" };

        var first = await Http.PostAsJsonAsync("/api/tasks/bulk", body, Json);
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        var summary = await Http.GetFromJsonAsync<GamificationDto>("/api/gamification", Json);
        Assert.NotNull(summary);
        Assert.Equal(40, summary.TotalXp);

        await Http.PostAsJsonAsync("/api/tasks/bulk", body, Json);
        var repeated = await Http.GetFromJsonAsync<GamificationDto>("/api/gamification", Json);
        Assert.NotNull(repeated);
        Assert.Equal(40, repeated.TotalXp);
    }
}
