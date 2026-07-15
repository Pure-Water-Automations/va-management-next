-- Remove the never-integrated Templates feature (ProjectTemplate/TaskTemplate):
-- the management page and instantiate API were never wired into the actual
-- project/task creation flow, so this drops the dead tables outright.
DROP TABLE "ProjectTemplate";
DROP TABLE "TaskTemplate";
