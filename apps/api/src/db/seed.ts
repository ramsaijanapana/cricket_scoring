import { db } from './index';
import { matchFormatConfig } from './schema/index';

async function seed() {
  console.log('Seeding match format configs...');

  await db.insert(matchFormatConfig).values([
    {
      name: 'T20',
      oversPerInnings: 20,
      inningsPerSide: 1,
      maxBowlerOvers: 4,
      powerplayConfig: [
        { name: 'Powerplay', startOver: 1, endOver: 6, fieldingRestriction: 2 },
      ],
      hasSuperOver: true,
      hasDls: true,
      hasFollowOn: false,
      ballsPerOver: 6,
    },
    {
      name: 'ODI',
      oversPerInnings: 50,
      inningsPerSide: 1,
      maxBowlerOvers: 10,
      powerplayConfig: [
        { name: 'Powerplay 1', startOver: 1, endOver: 10, fieldingRestriction: 2 },
        { name: 'Powerplay 2', startOver: 11, endOver: 40, fieldingRestriction: 4 },
        { name: 'Powerplay 3', startOver: 41, endOver: 50, fieldingRestriction: 4 },
      ],
      hasSuperOver: true,
      hasDls: true,
      hasFollowOn: false,
      ballsPerOver: 6,
    },
    {
      name: 'Test',
      oversPerInnings: null,
      inningsPerSide: 2,
      maxBowlerOvers: null,
      powerplayConfig: null,
      hasSuperOver: false,
      hasDls: false,
      hasFollowOn: true,
      ballsPerOver: 6,
    },
  ]).onConflictDoNothing();

  console.log('Seed complete.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
