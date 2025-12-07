-- Add 'meal_voucher' to account_type enum
ALTER TYPE account_type ADD VALUE IF NOT EXISTS 'meal_voucher';
