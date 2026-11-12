using Microsoft.EntityFrameworkCore;
using TaskFlow.Api.Data;
using TaskFlow.Api.Dtos;
using TaskFlow.Api.Models;

namespace TaskFlow.Api.Services;

public class GamificationService(TaskFlowDbContext db, TimeProvider time)
{
    private const int DefaultWeeklyGoal = 10;

    public async Task AwardCompletionAsync(TaskItem task)
    {
        var localNow = time.GetLocalNow();
        var localDate = DateOnly.FromDateTime(localNow.DateTime);
        if (!await HasTaskRewardAsync(task.Id))
        {
            var points = task.Priority switch
            {
                Priority.Low => 5,
                Priority.Medium => 10,
                Priority.High or Priority.Urgent => 15,
                _ => throw new InvalidOperationException("Task priority is invalid."),
            };
            db.XpLedger.Add(new XpLedgerEntry
            {
                TaskId = task.Id,
                RewardKey = $"task:{task.Id}:{Guid.NewGuid():N}",
                Kind = "TaskCompletion",
                Description = $"Completed: {task.Title}",
                Points = points,
                LocalDate = localDate,
                AwardedAt = time.GetUtcNow().UtcDateTime,
            });
        }

        if (task.DueDate == localDate &&
            await db.Tasks.AnyAsync(t => t.DueDate == localDate) &&
            !await db.Tasks.AnyAsync(t => t.DueDate == localDate && !t.IsCompleted))
        {
            var dailyKey = $"daily:{localDate:yyyy-MM-dd}";
            if (!await HasRewardAsync(dailyKey))
            {
                db.XpLedger.Add(new XpLedgerEntry
                {
                    RewardKey = dailyKey,
                    Kind = "DailyBonus",
                    Description = "Completed all tasks due today",
                    Points = 20,
                    LocalDate = localDate,
                    AwardedAt = time.GetUtcNow().UtcDateTime,
                });
            }
        }
    }

    public async Task<GamificationDto> GetAsync()
    {
        var today = DateOnly.FromDateTime(time.GetLocalNow().DateTime);
        var weekStart = today.AddDays(-(((int)today.DayOfWeek + 6) % 7));

        // Aggregates run in SQLite over the user's ledger (the (UserId, …) indexes drive every query);
        // only the 50 newest history rows are materialized, instead of the whole ledger.
        var totalXp = await db.XpLedger.SumAsync(x => x.Points);
        var xpThisWeek = await db.XpLedger
            .Where(x => x.LocalDate >= weekStart && x.LocalDate <= today)
            .SumAsync(x => x.Points);
        var ledgerCompletionDates = await db.XpLedger.AsNoTracking()
            .Where(x => x.Kind == "TaskCompletion")
            .Select(x => x.LocalDate)
            .Distinct()
            .ToListAsync();
        // Same ordering as before (AwardedAt descending); the projection only trims returned columns.
        var history = await db.XpLedger.AsNoTracking()
            .OrderByDescending(x => x.AwardedAt)
            .Take(50)
            .Select(x => new RewardHistoryDto(x.Id, x.Kind, x.Description, x.Points, x.LocalDate, x.AwardedAt))
            .ToListAsync();

        var completions = await db.Activity.AsNoTracking()
            .Where(x => x.Kind == "Completed")
            .Select(x => new { x.TaskId, x.At })
            .ToListAsync();
        var currentCompletions = await db.Tasks.AsNoTracking()
            .Where(x => x.IsCompleted && x.CompletedAt != null)
            .Select(x => new { x.Id, At = x.CompletedAt!.Value })
            .ToListAsync();
        var activityEvents = completions.Select(x => (x.TaskId, x.At)).ToHashSet();
        var completionEvents = completions.Select(x => x.At)
            .Concat(currentCompletions
                .Where(x => !activityEvents.Contains((x.Id, x.At)))
                .Select(x => x.At))
            .ToList();
        var completionDates = completionEvents
            .Select(LocalDate)
            .Concat(ledgerCompletionDates)
            .Distinct()
            .Order()
            .ToList();
        var currentStreak = StreakEndingAt(completionDates, today);
        var longestStreak = LongestStreak(completionDates);
        var completedThisWeek = completionEvents.Count(x => LocalDate(x) >= weekStart && LocalDate(x) <= today);
        var weeklyGoal = await db.GamificationSettings.AsNoTracking()
            .Select(x => (int?)x.WeeklyGoal).FirstOrDefaultAsync() ?? DefaultWeeklyGoal;
        // The same distinct union of completed-task identities, now evaluated as one SQL query.
        var completedTaskIds = await db.XpLedger
            .Where(x => x.Kind == "TaskCompletion" && x.TaskId != null).Select(x => x.TaskId!.Value)
            .Union(db.Activity.Where(x => x.Kind == "Completed").Select(x => x.TaskId))
            .Union(db.Tasks.Where(x => x.IsCompleted && x.CompletedAt != null).Select(x => x.Id))
            .CountAsync();
        var level = totalXp / 100 + 1;
        var achievements = new[]
        {
            Achievement("first-task", "First step", "Complete your first task.", completedTaskIds, 1),
            Achievement("ten-tasks", "Building momentum", "Complete 10 tasks.", completedTaskIds, 10),
            Achievement("fifty-tasks", "In the flow", "Complete 50 tasks.", completedTaskIds, 50),
            Achievement("three-day-streak", "Three-day streak", "Complete tasks on 3 consecutive days.", longestStreak, 3),
            Achievement("seven-day-streak", "A full week", "Complete tasks on 7 consecutive days.", longestStreak, 7),
            Achievement("five-hundred-xp", "Rising star", "Earn 500 XP.", totalXp, 500),
        };

        return new GamificationDto(totalXp, level, totalXp % 100, 100, currentStreak, longestStreak,
            completedThisWeek, weeklyGoal, xpThisWeek, achievements, history);
    }

    public async Task SetWeeklyGoalAsync(int weeklyGoal)
    {
        if (weeklyGoal is < 1 or > 100)
            throw ApiException.Invalid("WeeklyGoal", "Weekly goal must be between 1 and 100.");

        await UpsertWeeklyGoalAsync(weeklyGoal);
    }

    /// <summary>
    /// Inserts or updates the per-user weekly-goal settings row. Two concurrent requests with no settings
    /// row yet both take the insert path and lose the unique (UserId) index race on the second save; the
    /// loser then retries as a plain update so the last write wins. Any other database failure propagates.
    /// The split into stage/commit mirrors the notification sync: the concurrency regression tests use the
    /// stage half to interleave a competing writer between the existence check and the save.
    /// </summary>
    public async Task UpsertWeeklyGoalAsync(int weeklyGoal)
    {
        var created = await StageWeeklyGoalAsync(weeklyGoal);
        await CommitWeeklyGoalAsync(created, weeklyGoal);
    }

    internal async Task<GamificationSettings?> StageWeeklyGoalAsync(int weeklyGoal)
    {
        var settings = await db.GamificationSettings.FirstOrDefaultAsync();
        if (settings is null)
        {
            var created = new GamificationSettings { WeeklyGoal = weeklyGoal };
            db.GamificationSettings.Add(created);
            return created;
        }
        settings.WeeklyGoal = weeklyGoal;
        return null;
    }

    internal async Task CommitWeeklyGoalAsync(GamificationSettings? created, int weeklyGoal)
    {
        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException e) when (SqliteUnique.Violated(e))
        {
            if (created is null) throw; // the pure update path cannot lose a create-vs-create race
            // A concurrent request inserted the settings row first; update it instead of inserting.
            db.GamificationSettings.Remove(created); // Added entity: removing detaches it without a DELETE
            var winner = await db.GamificationSettings.FirstAsync();
            winner.WeeklyGoal = weeklyGoal;
            await db.SaveChangesAsync();
        }
    }

    private async Task<bool> HasRewardAsync(string rewardKey) =>
        db.XpLedger.Local.Any(x => x.RewardKey == rewardKey) ||
        await db.XpLedger.AnyAsync(x => x.RewardKey == rewardKey);

    private async Task<bool> HasTaskRewardAsync(int taskId) =>
        db.XpLedger.Local.Any(x => x.TaskId == taskId && x.Kind == "TaskCompletion") ||
        await db.XpLedger.AnyAsync(x => x.TaskId == taskId && x.Kind == "TaskCompletion");

    private DateOnly LocalDate(DateTime utc) =>
        DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(utc, DateTimeKind.Utc), time.LocalTimeZone));

    private static AchievementDto Achievement(string key, string name, string description, int progress, int target) =>
        new(key, name, description, progress >= target, Math.Min(progress, target), target);

    private static int StreakEndingAt(IReadOnlyCollection<DateOnly> dates, DateOnly today)
    {
        var set = dates.ToHashSet();
        var cursor = set.Contains(today) ? today : today.AddDays(-1);
        var streak = 0;
        while (set.Contains(cursor))
        {
            streak++;
            cursor = cursor.AddDays(-1);
        }
        return streak;
    }

    private static int LongestStreak(IReadOnlyList<DateOnly> dates)
    {
        var best = 0;
        var run = 0;
        DateOnly? previous = null;
        foreach (var date in dates)
        {
            run = previous is { } prior && date.DayNumber - prior.DayNumber == 1 ? run + 1 : 1;
            best = Math.Max(best, run);
            previous = date;
        }
        return best;
    }
}
