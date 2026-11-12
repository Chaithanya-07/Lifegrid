using TaskFlow.Api.Data;

namespace TaskFlow.Tests;

/// <summary>
/// The development data-directory portability: the repository's <c>data</c> directory is anchored at the
/// content root (not the working directory), can be overridden, and absolute paths are left untouched.
/// </summary>
public class DevDataPathsTests
{
    private static (string projectDir, string repoRoot) Layout()
    {
        var repoRoot = Path.Combine(Path.GetTempPath(), "lifegrid-devpaths-test");
        var projectDir = Path.Combine(repoRoot, "api", "TaskFlow.Api");
        return (projectDir, repoRoot);
    }

    [Fact]
    public void Default_resolution_anchors_at_repository_data_directory()
    {
        var (projectDir, repoRoot) = Layout();
        var resolved = DevDataPaths.ResolveDataDirectory(projectDir, configured: null);
        Assert.Equal(Path.Combine(repoRoot, "data"), resolved);
    }

    [Fact]
    public void Configured_override_replaces_the_anchor()
    {
        var (projectDir, repoRoot) = Layout();
        var custom = Path.Combine(repoRoot, "custom-data");
        var resolved = DevDataPaths.ResolveDataDirectory(projectDir, configured: custom);
        Assert.Equal(custom, resolved);
    }

    [Fact]
    public void Empty_configured_value_falls_back_to_the_default_anchor()
    {
        var (projectDir, repoRoot) = Layout();
        var resolved = DevDataPaths.ResolveDataDirectory(projectDir, configured: "");
        Assert.Equal(Path.Combine(repoRoot, "data"), resolved);
    }

    [Fact]
    public void Relative_backups_and_attachments_are_rebased_onto_the_data_directory()
    {
        var dataDir = Path.Combine(Path.GetTempPath(), "lifegrid-devpaths-test", "data");
        Assert.Equal(Path.Combine(dataDir, "backups"), DevDataPaths.Rebase("backups", dataDir));
        Assert.Equal(Path.Combine(dataDir, "attachments"), DevDataPaths.Rebase("attachments", dataDir));
    }

    [Fact]
    public void Absolute_paths_are_never_rebased()
    {
        var dataDir = Path.Combine(Path.GetTempPath(), "lifegrid-devpaths-test", "data");
        var absolute = Path.Combine(Path.GetTempPath(), "factory-temp", "backups");
        Assert.Equal(absolute, DevDataPaths.Rebase(absolute, dataDir));
    }

    [Fact]
    public void Empty_values_pass_through()
    {
        var dataDir = Path.Combine(Path.GetTempPath(), "lifegrid-devpaths-test", "data");
        Assert.Equal("", DevDataPaths.Rebase(null, dataDir));
        Assert.Equal("", DevDataPaths.Rebase("", dataDir));
        Assert.Equal(" ", DevDataPaths.Rebase(" ", dataDir)); // untouched input; consumers treat it as unset
    }

    [Fact]
    public void Relative_sqlite_data_source_is_rebased_into_the_data_directory()
    {
        var dataDir = Path.Combine(Path.GetTempPath(), "lifegrid-devpaths-test", "data");
        var rewritten = new Microsoft.Data.Sqlite.SqliteConnectionStringBuilder(
            DevDataPaths.RebaseConnectionString("Data Source=taskflow.db", dataDir));
        Assert.Equal(Path.Combine(dataDir, "taskflow.db"), rewritten.DataSource);
    }

    [Fact]
    public void Absolute_connection_string_is_returned_unchanged()
    {
        var dataDir = Path.Combine(Path.GetTempPath(), "lifegrid-devpaths-test", "data");
        var own = $"Data Source={Path.Combine(Path.GetTempPath(), "factory.db")}";
        Assert.Equal(own, DevDataPaths.RebaseConnectionString(own, dataDir));
    }

    [Fact]
    public void Rebased_connection_string_preserves_the_database_file_name()
    {
        var dataDir = Path.Combine(Path.GetTempPath(), "lifegrid-devpaths-test", "data");
        var rewritten = new Microsoft.Data.Sqlite.SqliteConnectionStringBuilder(
            DevDataPaths.RebaseConnectionString("Data Source=other.db", dataDir));
        Assert.Equal(Path.Combine(dataDir, "other.db"), rewritten.DataSource);
    }
}
