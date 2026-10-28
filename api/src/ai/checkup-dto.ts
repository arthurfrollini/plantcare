import { checkupSchema, type Checkup } from '@plantcare/shared';
import type { Checkup as CheckupRow } from '../generated/prisma/client';

export type { CheckupRow };

export function toCheckupDto(row: CheckupRow): Checkup {
  return checkupSchema.parse({
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    description: row.description,
    problem: row.problem,
    steps: row.steps,
    whenToWorry: row.whenToWorry,
    status: row.status,
    healedAt: row.healedAt?.toISOString() ?? null,
    photoUrl: `/me/plants/${row.userPlantId}/checkups/${row.id}/photo`,
  });
}
