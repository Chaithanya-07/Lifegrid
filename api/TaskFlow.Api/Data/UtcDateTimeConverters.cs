using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace TaskFlow.Api.Data;

// Timestamps are always stored as UTC. SQLite returns them as DateTimeKind.Unspecified, which
// serialises without a trailing "Z" and is then misread as local time by clients. Marking them
// as UTC on the way out keeps API output consistent. The stored text is unchanged.
public sealed class UtcDateTimeConverter()
    : ValueConverter<DateTime, DateTime>(
        v => v.Kind == DateTimeKind.Local ? v.ToUniversalTime() : v,
        v => DateTime.SpecifyKind(v, DateTimeKind.Utc));

public sealed class UtcNullableDateTimeConverter()
    : ValueConverter<DateTime?, DateTime?>(
        v => v.HasValue && v.Value.Kind == DateTimeKind.Local ? v.Value.ToUniversalTime() : v,
        v => v.HasValue ? DateTime.SpecifyKind(v.Value, DateTimeKind.Utc) : v);

public static class UtcConventions
{
    public static void UseUtcDateTimes(this ModelConfigurationBuilder b)
    {
        b.Properties<DateTime>().HaveConversion<UtcDateTimeConverter>();
        b.Properties<DateTime?>().HaveConversion<UtcNullableDateTimeConverter>();
    }
}
