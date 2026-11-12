namespace TaskFlow.Api.Models;

public class Category : IUserOwned, IHasId
{
    public int UserId { get; set; }

    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string Color { get; set; } = "#6366f1";
    public List<TaskItem> Tasks { get; set; } = [];
}
