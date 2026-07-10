export const MIGRATION_FILENAME_PATTERN =
  /^(?<timestamp>\d{14})_(?<description>[a-z][a-z0-9]*(?:_[a-z0-9]+)*)\.sql$/;

function validTimestamp(value: string): boolean {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const hour = Number(value.slice(8, 10));
  const minute = Number(value.slice(10, 12));
  const second = Number(value.slice(12, 14));
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute &&
    date.getUTCSeconds() === second
  );
}

export function isValidMigrationFilename(filename: string): boolean {
  const match = MIGRATION_FILENAME_PATTERN.exec(filename);
  return match?.groups?.['timestamp'] !== undefined && validTimestamp(match.groups['timestamp']);
}

export function assertValidMigrationFilename(filename: string): void {
  if (!isValidMigrationFilename(filename)) {
    throw new Error(
      `Invalid migration filename "${filename}". Expected YYYYMMDDHHMMSS_snake_case_description.sql using a valid UTC timestamp.`,
    );
  }
}

function migrationTimestamp(date: Date): string {
  if (Number.isNaN(date.getTime())) {
    throw new Error('Migration date must be valid');
  }

  return [
    date.getUTCFullYear().toString().padStart(4, '0'),
    (date.getUTCMonth() + 1).toString().padStart(2, '0'),
    date.getUTCDate().toString().padStart(2, '0'),
    date.getUTCHours().toString().padStart(2, '0'),
    date.getUTCMinutes().toString().padStart(2, '0'),
    date.getUTCSeconds().toString().padStart(2, '0'),
  ].join('');
}

export function createMigrationFilename(description: string, date = new Date()): string {
  if (!/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(description)) {
    throw new Error('Migration description must use lowercase snake_case');
  }

  return `${migrationTimestamp(date)}_${description}.sql`;
}
