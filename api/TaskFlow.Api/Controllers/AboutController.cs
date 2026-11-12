using Microsoft.AspNetCore.Mvc;
using TaskFlow.Api.Services;

namespace TaskFlow.Api.Controllers;

/// <summary>Server file locations are deliberately not disclosed: this API is shared by many users.</summary>
public record AboutDto(
    string Name, string Version, string DatabasePath, string BackupDirectory, string AttachmentsDirectory,
    string TimeZone, DateTime ServerTimeUtc, string AllowedAttachmentTypes, long MaxAttachmentBytes);

[ApiController]
[Route("api/about")]
public class AboutController(TimeProvider time) : ControllerBase
{
    public const string AppVersion = "1.0.0";
    private const string Hosted = "Stored on the server (private to your account)";

    [HttpGet]
    public AboutDto Get() =>
        new("Lifegrid", AppVersion, Hosted, Hosted, Hosted,
            time.LocalTimeZone.Id, time.GetUtcNow().UtcDateTime, AttachmentService.AllowedExtensions, AttachmentService.MaxBytes);
}
