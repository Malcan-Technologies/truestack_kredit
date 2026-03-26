-- CreateTable
CREATE TABLE "BorrowerDirector" (
    "id" TEXT NOT NULL,
    "borrowerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icNumber" TEXT NOT NULL,
    "position" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BorrowerDirector_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BorrowerDirector_borrowerId_idx" ON "BorrowerDirector"("borrowerId");

-- AddForeignKey
ALTER TABLE "BorrowerDirector" ADD CONSTRAINT "BorrowerDirector_borrowerId_fkey" FOREIGN KEY ("borrowerId") REFERENCES "Borrower"("id") ON DELETE CASCADE ON UPDATE CASCADE;
