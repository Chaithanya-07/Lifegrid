namespace TaskFlow.Api.Models;

public class XpLedgerEntry : IUserOwned, IHasId
{
    public int UserId { get; set; }
    public int Id { get; set; }
    public int? TaskId { get; set; }
    public TaskItem? Task { get; set; }
    public string RewardKey { get; set; } = "";
    public string Kind { get; set; } = "";
    public string Description { get; set; } = "";
    public int Points { get; set; }
    public DateOnly LocalDate { get; set; }
    public DateTime AwardedAt { get; set; }
}

public class GamificationSettings : IUserOwned, IHasId
{
    public int UserId { get; set; }
    public int Id { get; set; }
    public int WeeklyGoal { get; set; } = 10;
}
