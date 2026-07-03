-- Add 'digest' to the NotifyChannel enum: a VA can opt into a daily email digest
-- of their open tasks instead of immediate per-task notifications.
ALTER TYPE "NotifyChannel" ADD VALUE IF NOT EXISTS 'digest';
