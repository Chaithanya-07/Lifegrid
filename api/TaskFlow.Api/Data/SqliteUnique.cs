using Microsoft.EntityFrameworkCore;

namespace TaskFlow.Api.Data;

/// <summary>
/// Narrow matcher for the one kind of concurrency failure this app *expects*: two writers (e.g. two open
/// tabs, or a tab's notification timer racing a refresh) both pass an existence check and both insert,
/// and the second loses the race against a unique index at SaveChanges time. Only the unique-constraint
/// error is matched; every other failure (not-null 1299, check 275, foreign key 787, database locked 5)
/// propagates untouched so real corruption or bugs are never swallowed.
/// </summary>
public static class SqliteUnique
{
    /// <summary>SQLITE_CONSTRAINT_UNIQUE — "another row already has this key".</summary>
    public const int ConstraintUnique = 2067;

    public static bool Violated(DbUpdateException e) =>
        e.InnerException is Microsoft.Data.Sqlite.SqliteException se
        && se.SqliteExtendedErrorCode == ConstraintUnique;
}
