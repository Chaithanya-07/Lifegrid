using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TaskFlow.Api.Migrations
{
    /// <inheritdoc />
    public partial class Gamification : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "GamificationSettings",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    UserId = table.Column<int>(type: "INTEGER", nullable: false),
                    WeeklyGoal = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GamificationSettings", x => x.Id);
                    table.CheckConstraint("CK_GamificationSettings_WeeklyGoal", "\"WeeklyGoal\" BETWEEN 1 AND 100");
                    table.ForeignKey(
                        name: "FK_GamificationSettings_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "XpLedger",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    UserId = table.Column<int>(type: "INTEGER", nullable: false),
                    TaskId = table.Column<int>(type: "INTEGER", nullable: true),
                    RewardKey = table.Column<string>(type: "TEXT", maxLength: 80, nullable: false),
                    Kind = table.Column<string>(type: "TEXT", maxLength: 30, nullable: false),
                    Description = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    Points = table.Column<int>(type: "INTEGER", nullable: false),
                    LocalDate = table.Column<DateOnly>(type: "TEXT", nullable: false),
                    AwardedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_XpLedger", x => x.Id);
                    table.ForeignKey(
                        name: "FK_XpLedger_Tasks_TaskId",
                        column: x => x.TaskId,
                        principalTable: "Tasks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_XpLedger_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_GamificationSettings_UserId",
                table: "GamificationSettings",
                column: "UserId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_XpLedger_TaskId",
                table: "XpLedger",
                column: "TaskId");

            migrationBuilder.CreateIndex(
                name: "IX_XpLedger_UserId",
                table: "XpLedger",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_XpLedger_UserId_LocalDate",
                table: "XpLedger",
                columns: new[] { "UserId", "LocalDate" });

            migrationBuilder.CreateIndex(
                name: "IX_XpLedger_UserId_RewardKey",
                table: "XpLedger",
                columns: new[] { "UserId", "RewardKey" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_XpLedger_UserId_TaskId",
                table: "XpLedger",
                columns: new[] { "UserId", "TaskId" },
                unique: true,
                filter: "\"TaskId\" IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "GamificationSettings");

            migrationBuilder.DropTable(
                name: "XpLedger");
        }
    }
}
