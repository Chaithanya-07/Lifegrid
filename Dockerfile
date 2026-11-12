# Lifegrid API – production image (ASP.NET Core / .NET 10 + SQLite).
# Build context is the repository root:  docker build -t lifegrid-api .

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY api/TaskFlow.Api/TaskFlow.Api.csproj api/TaskFlow.Api/
RUN dotnet restore api/TaskFlow.Api/TaskFlow.Api.csproj
COPY api/TaskFlow.Api/ api/TaskFlow.Api/
RUN dotnet publish api/TaskFlow.Api/TaskFlow.Api.csproj -c Release -o /app --no-restore /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
# tzdata: "today", overdue and analytics are computed in the server time zone (set TZ, e.g. Asia/Kolkata).
RUN apt-get update \
 && apt-get install -y --no-install-recommends tzdata \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app .
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENV ASPNETCORE_ENVIRONMENT=Production \
    ASPNETCORE_FORWARDEDHEADERS_ENABLED=true \
    DOTNET_gcServer=0 \
    TZ=UTC \
    DATA_DIR=/data \
    ConnectionStrings__Default="Data Source=/data/taskflow.db" \
    Backups__Directory=/data/backups \
    Attachments__Directory=/data/attachments \
    DataProtection__KeysDirectory=/data/keys

# Everything the app writes lives under /data. Mount a persistent volume here (Railway: volume mount path /data).
VOLUME ["/data"]
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
