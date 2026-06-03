-- Add CUSTOMER as a first-class account role for buyer authentication.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'CUSTOMER';
