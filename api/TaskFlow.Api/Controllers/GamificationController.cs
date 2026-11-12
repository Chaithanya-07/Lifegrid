using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Mvc;
using TaskFlow.Api.Dtos;
using TaskFlow.Api.Services;

namespace TaskFlow.Api.Controllers;

public record WeeklyGoalInput([Range(1, 100)] int WeeklyGoal);

[ApiController]
[Route("api/gamification")]
public class GamificationController(GamificationService gamification) : ControllerBase
{
    [HttpGet]
    public Task<GamificationDto> Get() => gamification.GetAsync();

    [HttpPut("weekly-goal")]
    public async Task<IActionResult> SetWeeklyGoal(WeeklyGoalInput input)
    {
        await gamification.SetWeeklyGoalAsync(input.WeeklyGoal);
        return NoContent();
    }
}
