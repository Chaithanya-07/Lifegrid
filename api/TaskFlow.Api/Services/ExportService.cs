using System.Globalization;
using System.Text;
using Microsoft.EntityFrameworkCore;
using TaskFlow.Api.Data;
using TaskFlow.Api.Dtos;

namespace TaskFlow.Api.Services;

public class ExportService(TaskFlowDbContext db, TimeProvider time)
{
    private static string D(DateOnly d) => d.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    public async Task<ExportDocument> BuildAsync()
    {
        var categories = await db.Categories.OrderBy(c => c.Id)
            .Select(c => new ExportCategory(c.Id, c.Name, c.Color)).ToListAsync();
        var tags = await db.Tags.OrderBy(t => t.Id).Select(t => new ExportTag(t.Id, t.Name, t.Color)).ToListAsync();
        var rules = (await db.RecurrenceRules.OrderBy(r => r.Id).ToListAsync()).Select(r => new ExportRecurrence(
            r.Id, r.Frequency.ToString(), r.Interval, RecurrenceCalculator.ParseList(r.Weekdays),
            RecurrenceCalculator.ParseList(r.MonthDays), D(r.AnchorDate), r.EndDate is { } e ? D(e) : null,
            r.MaxOccurrences, r.OccurrencesGenerated, r.IsActive)).ToList();

        var tasks = await db.Tasks.AsNoTracking().OrderBy(t => t.Id).ToListAsync();
        var subtasks = (await db.Subtasks.AsNoTracking().OrderBy(s => s.SortOrder).ThenBy(s => s.Id).ToListAsync()).ToLookup(s => s.TaskId);
        var taskTags = (await db.TaskTags.AsNoTracking().ToListAsync()).ToLookup(x => x.TaskId, x => x.TagId);
        var reminders = (await db.Reminders.AsNoTracking().OrderBy(r => r.Id).ToListAsync()).ToLookup(r => r.TaskId);
        var attachments = (await db.Attachments.AsNoTracking().OrderBy(a => a.Id).ToListAsync()).ToLookup(a => a.TaskId);

        var exported = tasks.Select(t => new ExportTask(
            t.Id, t.Title, t.Notes, t.IsCompleted, t.Priority.ToString(),
            t.DueDate is { } due ? D(due) : null,
            t.CategoryId, t.CreatedAt, t.UpdatedAt, t.CompletedAt,
            subtasks[t.Id].Select(s => new ExportSubtask(s.Title, s.IsCompleted, s.CreatedAt, s.CompletedAt)).ToList(),
            t.Description, t.Status.ToString(), t.StartDate is { } sd ? D(sd) : null,
            t.DueTime?.ToString("HH:mm", CultureInfo.InvariantCulture),
            t.EstimatedMinutes, t.ActualMinutes, t.IsPinned, t.IsFavorite, t.SortOrder,
            taskTags[t.Id].Order().ToList(), t.RecurrenceRuleId, t.OccurrenceNumber,
            reminders[t.Id].Select(r => new ExportReminder(r.MinutesBefore, r.RemindAt, r.NotifiedAt is not null)).ToList(),
            attachments[t.Id].Select(a => new ExportAttachment(a.FileName, a.StoredName, a.ContentType, a.SizeBytes, a.CreatedAt)).ToList()))
            .ToList();

        var focus = (await db.FocusSessions.AsNoTracking().OrderBy(f => f.Id).ToListAsync())
            .Select(f => new ExportFocusSession(f.TaskId, f.Kind.ToString(), f.PlannedSeconds, f.ActualSeconds, f.Completed, f.StartedAt, f.EndedAt))
            .ToList();

        var goal = await db.GamificationSettings.AsNoTracking().Select(x => (int?)x.WeeklyGoal).FirstOrDefaultAsync();
        var rewards = (await db.XpLedger.AsNoTracking().OrderBy(x => x.Id).ToListAsync())
            .Select(x => new ExportReward(x.TaskId, x.RewardKey, x.Kind, x.Description, x.Points, x.LocalDate, x.AwardedAt))
            .ToList();

        return new ExportDocument(ExportFormat.Schema, ExportFormat.Version, time.GetUtcNow().UtcDateTime,
            categories, exported, tags, rules, focus, new ExportGamification(goal, rewards));
    }

    private static readonly string[] CsvHeader =
    [
        "Id", "Title", "Notes", "Status", "Priority", "DueDate", "Category", "Subtasks", "CreatedAtUtc", "CompletedAtUtc",
        "Description", "Board", "StartDate", "DueTime", "EstimatedMinutes", "ActualMinutes", "Tags", "Pinned", "Favorite", "Repeats",
    ];

    public async Task<string> BuildCsvAsync()
    {
        var names = await db.Categories.ToDictionaryAsync(c => c.Id, c => c.Name);
        var tasks = await db.Tasks.AsNoTracking().Include(t => t.RecurrenceRule).OrderBy(t => t.Id).ToListAsync();
        var subtasks = (await db.Subtasks.ToListAsync()).ToLookup(s => s.TaskId);
        var tagNames = await db.Tags.ToDictionaryAsync(t => t.Id, t => t.Name);
        var taskTags = (await db.TaskTags.ToListAsync()).ToLookup(x => x.TaskId, x => x.TagId);

        var sb = new StringBuilder();
        sb.AppendLine(string.Join(',', CsvHeader));
        foreach (var t in tasks)
        {
            var subs = subtasks[t.Id].ToList();
            var row = new[]
            {
                t.Id.ToString(CultureInfo.InvariantCulture),
                t.Title,
                t.Notes ?? "",
                t.IsCompleted ? "Completed" : "Open",
                t.Priority.ToString(),
                t.DueDate?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) ?? "",
                t.CategoryId is int id && names.TryGetValue(id, out var n) ? n : "",
                subs.Count == 0 ? "" : $"{subs.Count(s => s.IsCompleted)}/{subs.Count}",
                t.CreatedAt.ToString("o", CultureInfo.InvariantCulture),
                t.CompletedAt?.ToString("o", CultureInfo.InvariantCulture) ?? "",
                t.Description ?? "",
                t.Status.ToString(),
                t.StartDate?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) ?? "",
                t.DueTime?.ToString("HH:mm", CultureInfo.InvariantCulture) ?? "",
                t.EstimatedMinutes?.ToString(CultureInfo.InvariantCulture) ?? "",
                t.ActualMinutes?.ToString(CultureInfo.InvariantCulture) ?? "",
                string.Join(' ', taskTags[t.Id].Where(tagNames.ContainsKey).Select(x => tagNames[x]).Order()),
                t.IsPinned ? "Yes" : "",
                t.IsFavorite ? "Yes" : "",
                t.RecurrenceRule is { } r ? $"{r.Frequency} every {r.Interval}{(r.IsActive ? "" : " (stopped)")}" : "",
            };
            sb.AppendLine(string.Join(',', row.Select(CsvCell)));
        }
        return sb.ToString();
    }

    /// <summary>RFC 4180 quoting, plus neutralising spreadsheet formulas (CSV injection).</summary>
    public static string CsvCell(string value)
    {
        if (value.Length > 0 && value[0] is '=' or '+' or '-' or '@' or '\t' or '\r')
            value = "'" + value;
        return value.IndexOfAny([',', '"', '\n', '\r']) >= 0
            ? "\"" + value.Replace("\"", "\"\"") + "\""
            : value;
    }

}
