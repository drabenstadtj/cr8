-- CreateTable
CREATE TABLE "ExplorationRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL,
    "finishedAt" DATETIME,
    "outcome" TEXT NOT NULL,
    "usersProcessed" INTEGER NOT NULL DEFAULT 0,
    "requestsCreated" INTEGER NOT NULL DEFAULT 0,
    "albumsSkipped" INTEGER NOT NULL DEFAULT 0,
    "failures" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "ExplorationRun_runId_key" ON "ExplorationRun"("runId");
