namespace TaskFlow.Api.Models;

/// <summary>Implemented by every table that holds a user's private data; the DbContext filters and stamps on it.</summary>
public interface IUserOwned
{
    int UserId { get; set; }
}

public interface IHasId
{
    int Id { get; }
}

public class User
{
    public int Id { get; set; }
    /// <summary>Lower-cased, unique.</summary>
    public string Email { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public DateTime CreatedAt { get; set; }
    public DateTime? LastLoginAt { get; set; }
    public int FailedLogins { get; set; }
    public DateTime? LockedUntil { get; set; }
}
