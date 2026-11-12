using System.Text.Json;
using System.Text.RegularExpressions;
using TaskFlow.Api.Auth;
using TaskFlow.Api.Dtos;

namespace TaskFlow.Api.Services;

/// <summary>
/// Point-in-time copies of ONE user's data, stored as Lifegrid export files (JSON) in that user's own folder
/// (<c>Backups:Directory/&lt;userId&gt;</c>). Names are unique, an existing file is never overwritten, and
/// the newest <see cref="MaxPerUser"/> are kept. Restoring replaces only that user's data.
/// </summary>
public partial class BackupService(IConfiguration config, TimeProvider time, ExportService exporter, ICurrentUser me)
{
    public const int MaxPerUser = 25;

    [GeneratedRegex(@"^taskflow-[A-Za-z0-9_\-]+\.json$")]
    private static partial Regex NamePattern();

    private static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web) { MaxDepth = 16 };

    public string Directory => Path.Combine(
        Path.GetFullPath(config["Backups:Directory"] ?? throw new InvalidOperationException("Backups:Directory is not configured.")),
        (me.UserId ?? throw new InvalidOperationException("No signed-in user.")).ToString());

    public async Task<BackupInfo> CreateAsync(string kind = "backup")
    {
        System.IO.Directory.CreateDirectory(Directory);
        var doc = await exporter.BuildAsync();
        var stamp = time.GetUtcNow().UtcDateTime.ToString("yyyyMMdd-HHmmss");
        var n = 0;
        string name, path;
        do
        {
            name = n == 0 ? $"taskflow-{kind}-{stamp}.json" : $"taskflow-{kind}-{stamp}-{n}.json";
            path = Path.Combine(Directory, name);
            n++;
        } while (File.Exists(path));

        await using (var fs = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None))
            await JsonSerializer.SerializeAsync(fs, doc, Options);
        Prune();
        return Describe(new FileInfo(path));
    }

    public List<BackupInfo> List() =>
        !System.IO.Directory.Exists(Directory)
            ? []
            : new DirectoryInfo(Directory).EnumerateFiles("taskflow-*.json")
                .Where(f => NamePattern().IsMatch(f.Name))
                .OrderByDescending(f => f.LastWriteTimeUtc).ThenByDescending(f => f.Name)
                .Select(Describe).ToList();

    /// <summary>Maps a client-supplied name to a file inside this user's backup folder, or null. Blocks path tricks.</summary>
    public string? Resolve(string name)
    {
        if (!NamePattern().IsMatch(name)) return null;
        var path = Path.Combine(Directory, name);
        return File.Exists(path) ? path : null;
    }

    public ExportDocument Read(string path)
    {
        try
        {
            using var fs = File.OpenRead(path);
            var doc = JsonSerializer.Deserialize<ExportDocument>(fs, Options);
            if (doc is null || doc.Schema != ExportFormat.Schema || doc.Tasks is null || doc.Categories is null)
                throw new InvalidDataException("This file is not a Lifegrid backup.");
            return doc;
        }
        catch (JsonException ex)
        {
            throw new InvalidDataException("This file is not a Lifegrid backup.", ex);
        }
    }

    private void Prune()
    {
        foreach (var old in List().Skip(MaxPerUser))
            try { File.Delete(Path.Combine(Directory, old.Name)); } catch { /* best effort */ }
    }

    private static BackupInfo Describe(FileInfo f) => new(f.Name, f.Length, f.LastWriteTimeUtc);
}
