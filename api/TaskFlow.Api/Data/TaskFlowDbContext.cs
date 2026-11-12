using Microsoft.EntityFrameworkCore;
using TaskFlow.Api.Auth;
using TaskFlow.Api.Models;

namespace TaskFlow.Api.Data;

/// <summary>
/// The data-access layer: EF Core's DbContext is the unit of work and its DbSets are the repositories.
/// Business rules live in the services, never in controllers or here.
/// </summary>
public class TaskFlowDbContext(DbContextOptions<TaskFlowDbContext> options, ICurrentUser? current = null) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();

    /// <summary>The signed-in user. Every query on a user-owned table is filtered to it; with nobody signed in nothing matches.</summary>
    public int? CurrentUserId => current?.UserId;

    public DbSet<TaskItem> Tasks => Set<TaskItem>();
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<Subtask> Subtasks => Set<Subtask>();
    public DbSet<Tag> Tags => Set<Tag>();
    public DbSet<TaskTag> TaskTags => Set<TaskTag>();
    public DbSet<RecurrenceRule> RecurrenceRules => Set<RecurrenceRule>();
    public DbSet<Reminder> Reminders => Set<Reminder>();
    public DbSet<AppNotification> Notifications => Set<AppNotification>();
    public DbSet<FocusSession> FocusSessions => Set<FocusSession>();
    public DbSet<ActivityEntry> Activity => Set<ActivityEntry>();
    public DbSet<Attachment> Attachments => Set<Attachment>();
    public DbSet<XpLedgerEntry> XpLedger => Set<XpLedgerEntry>();
    public DbSet<GamificationSettings> GamificationSettings => Set<GamificationSettings>();

    protected override void ConfigureConventions(ModelConfigurationBuilder b) => b.UseUtcDateTimes();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<User>(e =>
        {
            e.Property(u => u.Email).IsRequired().HasMaxLength(254).UseCollation("NOCASE");
            e.Property(u => u.PasswordHash).IsRequired().HasMaxLength(300);
            e.HasIndex(u => u.Email).IsUnique();
        });
        Own<TaskItem>(b); Own<Category>(b); Own<Tag>(b); Own<TaskTag>(b); Own<Subtask>(b); Own<RecurrenceRule>(b);
        Own<Reminder>(b); Own<AppNotification>(b); Own<FocusSession>(b); Own<ActivityEntry>(b); Own<Attachment>(b);
        Own<XpLedgerEntry>(b); Own<GamificationSettings>(b);

        b.Entity<TaskItem>(e =>
        {
            e.Property(t => t.Title).IsRequired().HasMaxLength(200);
            e.Property(t => t.Description).HasMaxLength(4000);
            e.Property(t => t.Notes).HasMaxLength(4000);
            e.Property(t => t.Priority).HasConversion<string>().HasMaxLength(10);
            e.Property(t => t.Status).HasConversion<string>().HasMaxLength(12).HasDefaultValue(WorkStatus.Todo);
            e.HasOne(t => t.Category).WithMany(c => c.Tasks)
                .HasForeignKey(t => t.CategoryId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(t => t.RecurrenceRule).WithMany()
                .HasForeignKey(t => t.RecurrenceRuleId).OnDelete(DeleteBehavior.SetNull);
            e.HasIndex(t => t.IsCompleted);
            e.HasIndex(t => t.DueDate);
            e.HasIndex(t => t.Status);
            e.HasIndex(t => t.UpdatedAt);
            e.HasIndex(t => t.CategoryId);
            // One task per (series, occurrence number): the database refuses a duplicate occurrence even in a race.
            e.HasIndex(t => new { t.RecurrenceRuleId, t.OccurrenceNumber }).IsUnique()
                .HasFilter("\"RecurrenceRuleId\" IS NOT NULL");
        });
        b.Entity<Subtask>(e =>
        {
            e.Property(s => s.Title).IsRequired().HasMaxLength(200);
            e.HasOne(s => s.Task).WithMany(t => t.Subtasks)
                .HasForeignKey(s => s.TaskId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(s => new { s.TaskId, s.SortOrder });
        });
        b.Entity<Category>(e =>
        {
            // NOCASE: "work" and "Work" are the same category, for both the unique index and lookups.
            e.Property(c => c.Name).IsRequired().HasMaxLength(50).UseCollation("NOCASE");
            e.Property(c => c.Color).IsRequired().HasMaxLength(9);
            e.HasIndex(c => new { c.UserId, c.Name }).IsUnique();
        });
        b.Entity<Tag>(e =>
        {
            e.Property(x => x.Name).IsRequired().HasMaxLength(30).UseCollation("NOCASE");
            e.Property(x => x.Color).IsRequired().HasMaxLength(9);
            e.HasIndex(x => new { x.UserId, x.Name }).IsUnique();
        });
        b.Entity<TaskTag>(e =>
        {
            e.HasKey(x => new { x.TaskId, x.TagId });
            e.HasOne(x => x.Task).WithMany(t => t.TaskTags).HasForeignKey(x => x.TaskId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Tag).WithMany(t => t.TaskTags).HasForeignKey(x => x.TagId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(x => x.TagId);
        });
        b.Entity<RecurrenceRule>(e =>
        {
            e.Property(r => r.Frequency).HasConversion<string>().HasMaxLength(10);
            e.Property(r => r.Weekdays).HasMaxLength(20);
            e.Property(r => r.MonthDays).HasMaxLength(100);
        });
        b.Entity<Reminder>(e =>
        {
            e.HasOne(r => r.Task).WithMany(t => t.Reminders).HasForeignKey(r => r.TaskId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(r => new { r.NotifiedAt, r.RemindAt });
            e.HasIndex(r => r.TaskId);
        });
        b.Entity<AppNotification>(e =>
        {
            e.Property(n => n.Kind).HasConversion<string>().HasMaxLength(10);
            e.Property(n => n.Title).IsRequired().HasMaxLength(250);
            e.Property(n => n.Message).HasMaxLength(500);
            e.Property(n => n.DedupeKey).IsRequired().HasMaxLength(100);
            e.HasOne(n => n.Task).WithMany().HasForeignKey(n => n.TaskId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(n => new { n.UserId, n.DedupeKey }).IsUnique();
            e.HasIndex(n => n.CreatedAt);
        });
        b.Entity<FocusSession>(e =>
        {
            e.Property(f => f.Kind).HasConversion<string>().HasMaxLength(12);
            // Sessions are history: deleting a task keeps its sessions, just unlinked.
            e.HasOne(f => f.Task).WithMany().HasForeignKey(f => f.TaskId).OnDelete(DeleteBehavior.SetNull);
            e.HasIndex(f => f.StartedAt);
        });
        b.Entity<ActivityEntry>(e =>
        {
            e.Property(a => a.Kind).IsRequired().HasMaxLength(30);
            e.Property(a => a.Detail).HasMaxLength(500);
            e.HasOne(a => a.Task).WithMany(t => t.Activity).HasForeignKey(a => a.TaskId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(a => new { a.TaskId, a.At });
            e.HasIndex(a => a.At);
        });
        b.Entity<Attachment>(e =>
        {
            e.Property(a => a.FileName).IsRequired().HasMaxLength(255);
            e.Property(a => a.StoredName).IsRequired().HasMaxLength(80);
            e.Property(a => a.ContentType).IsRequired().HasMaxLength(100);
            e.HasOne(a => a.Task).WithMany(t => t.Attachments).HasForeignKey(a => a.TaskId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(a => a.TaskId);
        });
        b.Entity<XpLedgerEntry>(e =>
        {
            e.Property(x => x.RewardKey).IsRequired().HasMaxLength(80);
            e.Property(x => x.Kind).IsRequired().HasMaxLength(30);
            e.Property(x => x.Description).IsRequired().HasMaxLength(200);
            e.HasOne(x => x.Task).WithMany().HasForeignKey(x => x.TaskId).OnDelete(DeleteBehavior.SetNull);
            e.HasIndex(x => new { x.UserId, x.RewardKey }).IsUnique();
            e.HasIndex(x => new { x.UserId, x.LocalDate });
            e.HasIndex(x => new { x.UserId, x.TaskId }).IsUnique()
                .HasFilter("\"TaskId\" IS NOT NULL");
        });
        b.Entity<GamificationSettings>(e =>
        {
            e.HasIndex(x => x.UserId).IsUnique();
            e.ToTable(t => t.HasCheckConstraint("CK_GamificationSettings_WeeklyGoal", "\"WeeklyGoal\" BETWEEN 1 AND 100"));
        });
    }

    /// <summary>Row-level isolation: every user-owned table is filtered to the signed-in user and cascades with the account.</summary>
    private void Own<T>(ModelBuilder b) where T : class, IUserOwned
    {
        b.Entity<T>().HasQueryFilter(e => e.UserId == CurrentUserId);
        b.Entity<T>().HasIndex(e => e.UserId);
        b.Entity<T>().HasOne<User>().WithMany().HasForeignKey(e => e.UserId).OnDelete(DeleteBehavior.Cascade);
    }

    /// <summary>New rows are stamped with the signed-in user; the owner of an existing row can never be changed.</summary>
    private void StampOwner()
    {
        foreach (var entry in ChangeTracker.Entries<IUserOwned>())
        {
            if (entry.State == EntityState.Added)
            {
                if (CurrentUserId is not int uid)
                    throw new InvalidOperationException("Cannot save user data without a signed-in user.");
                entry.Entity.UserId = uid;
            }
            else if (entry.State == EntityState.Modified && entry.Property(nameof(IUserOwned.UserId)).IsModified)
            {
                throw new InvalidOperationException("The owner of a record cannot be changed.");
            }
        }
    }

    public override int SaveChanges(bool acceptAllChangesOnSuccess)
    {
        StampOwner();
        return base.SaveChanges(acceptAllChangesOnSuccess);
    }

    public override Task<int> SaveChangesAsync(bool acceptAllChangesOnSuccess, CancellationToken cancellationToken = default)
    {
        StampOwner();
        return base.SaveChangesAsync(acceptAllChangesOnSuccess, cancellationToken);
    }
}
