/*
  Warnings:

  - Added the required column `type` to the `Tenant` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "TenantType" AS ENUM ('PPW', 'PPG');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "type" "TenantType" NOT NULL;
