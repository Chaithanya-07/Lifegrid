namespace TaskFlow.Api.Data;

/// <summary>
/// Development-only portability for the SQLite data directory. The Development configuration ships
/// relative paths (so the repository can live anywhere on disk and no machine-specific path is
/// committed); this anchors them at the content root — the project directory when the API is launched
/// with <c>dotnet run</c> — rather than at the terminal's working directory the process happens to
/// inherit. <c>LIFEGRID_DATA_DIRECTORY</c> (configuration key <c>LifeGrid:DataDirectory</c>) overrides
/// the anchor; absolute paths are always left untouched, so the test factories and any explicit
/// deployment configuration are unaffected. The resolved paths are logged at startup (Information) in
/// development so the active database can be confirmed from the log output.
/// </summary>
public static class DevDataPaths
{
    /// <summary>
    /// The development data directory: the configured value if non-empty (made absolute against the
    /// content root when relative), otherwise the repository's <c>data</c> directory, found two levels
    /// above the content root (<c>api/TaskFlow.Api</c> sits three levels deep in the repository).
    /// Pure path arithmetic; performs no I/O.
    /// </summary>
    public static string ResolveDataDirectory(string contentRootPath, string? configured)
    {
        if (!string.IsNullOrWhiteSpace(configured))
            return Path.GetFullPath(configured, contentRootPath);
        // Two levels up from api/TaskFlow.Api is the repository root.
        return Path.GetFullPath(Path.Combine(contentRootPath, "..", "..", "data"), contentRootPath);
    }

    /// <summary>Relative values are combined with the data directory; absolute or empty values pass through.</summary>
    public static string Rebase(string? value, string dataDirectory) =>
        string.IsNullOrWhiteSpace(value) || Path.IsPathRooted(value) ? value ?? "" : Path.GetFullPath(Path.Combine(dataDirectory, value));

    /** Rewrites the SQLite connection string so a relative Data Source lands in the data directory. */
    public static string RebaseConnectionString(string connectionString, string dataDirectory)
    {
        var builder = new Microsoft.Data.Sqlite.SqliteConnectionStringBuilder(connectionString);
        if (Path.IsPathRooted(builder.DataSource)) return connectionString;
        builder.DataSource = Rebase(builder.DataSource, dataDirectory);
        return builder.ToString();
    }
}
