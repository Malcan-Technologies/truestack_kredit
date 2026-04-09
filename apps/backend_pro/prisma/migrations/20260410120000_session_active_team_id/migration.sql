-- Better Auth organization plugin: session.shape includes activeTeamId alongside activeOrganizationId

ALTER TABLE "Session" ADD COLUMN "activeTeamId" TEXT;

CREATE INDEX "Session_activeTeamId_idx" ON "Session"("activeTeamId");
