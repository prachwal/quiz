-- Teachers can close a class to new students without changing the code.
ALTER TABLE classes ADD COLUMN joining_open BOOLEAN NOT NULL DEFAULT true;
