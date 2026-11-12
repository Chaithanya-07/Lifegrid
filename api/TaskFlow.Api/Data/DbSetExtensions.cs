using Microsoft.EntityFrameworkCore;
using TaskFlow.Api.Models;

namespace TaskFlow.Api.Data;

public static class DbSetExtensions
{
    /// <summary>
    /// Like <c>FindAsync</c> but goes through the per-user query filter, so one user can never load another
    /// user's row by guessing its id. (<c>FindAsync</c> skips global query filters.)
    /// </summary>
    public static Task<T?> FindOwnedAsync<T>(this DbSet<T> set, int id) where T : class, IHasId =>
        set.FirstOrDefaultAsync(e => e.Id == id);
}
