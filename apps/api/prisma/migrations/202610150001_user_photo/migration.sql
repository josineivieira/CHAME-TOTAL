ALTER TABLE "User" ADD COLUMN "avatarData" TEXT;
ALTER TABLE "User" ADD CONSTRAINT "User_avatar_size" CHECK ("avatarData" IS NULL OR octet_length("avatarData") <= 200000);
